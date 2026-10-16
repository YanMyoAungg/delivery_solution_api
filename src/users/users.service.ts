import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import {
  getUniqueViolationConstraint,
  isUniqueViolation,
} from '../common/database/is-unique-violation.js';
import { hashPassword } from '../common/utils/password.util.js';
import {
  normalizeEmail,
  escapeLikeWildcards,
} from '../common/utils/normalize.util.js';
import { PermissionService } from '../permissions/permissions.service.js';
import { users } from './user.schema.js';
import { roles } from '../roles/roles.schema.js';
import { shops } from '../shops/shop.schema.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UserListResponseDto } from './dto/user-list-response.dto.js';

const SELECT_USER_COLUMNS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  roleId: true,
  shopId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

type UserRow = typeof users.$inferSelect;

/** Raw user row with the role relation joined — never carries password material. */
export type PublicUserRow = Omit<
  UserRow,
  'passwordHash' | 'passwordChangedAt'
> & {
  role: { name: string } | null;
};

/** Full user row including the password hash — only used for authentication. */
export type UserWithPassword = UserRow;

export function toUserResponse(row: PublicUserRow): UserResponseDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    roleId: row.roleId,
    shopId: row.shopId,
    role: row.role?.name ?? '',
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<UserListResponseDto> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;

    const conditions = [];
    if (query.search?.trim()) {
      const q = `%${escapeLikeWildcards(query.search.trim())}%`;
      conditions.push(or(ilike(users.name, q), ilike(users.email, q)));
    }
    if (query.roleId) conditions.push(eq(users.roleId, query.roleId));
    if (query.status) conditions.push(eq(users.status, query.status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.database.db.query.users.findMany({
        where,
        columns: SELECT_USER_COLUMNS,
        with: { role: { columns: { name: true } } },
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return {
      data: rows.map(toUserResponse),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  async getById(id: string): Promise<UserResponseDto> {
    const row = await this.findRawById(id);
    return toUserResponse(row);
  }

  async findByEmail(email: string): Promise<UserResponseDto | null> {
    const row = await this.database.db.query.users.findFirst({
      where: eq(users.email, normalizeEmail(email)),
      columns: SELECT_USER_COLUMNS,
      with: { role: { columns: { name: true } } },
    });
    return row ? toUserResponse(row) : null;
  }

  async findByEmailWithPassword(
    email: string,
  ): Promise<UserWithPassword | null> {
    const row = await this.database.db.query.users.findFirst({
      where: eq(users.email, normalizeEmail(email)),
    });
    return row ?? null;
  }

  async findByIdWithPassword(
    id: string,
  ): Promise<{ passwordHash: string } | null> {
    const row = await this.database.db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { passwordHash: true },
    });
    return row ?? null;
  }

  async create(
    dto: CreateUserDto,
    callerRoleId: string,
  ): Promise<UserResponseDto> {
    const role = await this.database.db.query.roles.findFirst({
      where: eq(roles.id, dto.roleId),
      columns: { id: true, name: true },
    });
    if (!role) throw new BadRequestException(`Role '${dto.roleId}' not found`);
    const shopName = await this.assertShopRole(
      role.name,
      dto.shopId ?? null,
      null,
    );
    await this.permissions.assertCallerCanAssign(callerRoleId, dto.roleId);
    await this.assertEmailAvailable(dto.email, null);

    const passwordHash = await hashPassword(dto.password);
    try {
      const inserted = await this.database.db
        .insert(users)
        .values({
          name: dto.name,
          email: normalizeEmail(dto.email),
          phone: dto.phone ?? null,
          passwordHash,
          passwordChangedAt: new Date(),
          roleId: dto.roleId,
          shopId: dto.shopId ?? null,
          status: dto.status ?? 'ACTIVE',
        })
        .returning({ id: users.id });
      return this.getById(inserted[0].id);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw this.uniqueConflict(err, {
          email: dto.email,
          shopName,
          shopId: dto.shopId,
        });
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    callerRoleId: string,
  ): Promise<UserResponseDto> {
    const existing = await this.findRawById(id);

    if (existing.role?.name === 'OWNER') {
      throw new ForbiddenException('Owner account cannot be modified via API');
    }

    if (dto.roleId && dto.roleId !== existing.roleId) {
      await this.permissions.assertCallerCanAssign(callerRoleId, dto.roleId);
    }

    const nextRole = dto.roleId
      ? await this.database.db.query.roles.findFirst({
          where: eq(roles.id, dto.roleId),
          columns: { id: true, name: true },
        })
      : existing.role;
    if (!nextRole) throw new BadRequestException(`Role '${dto.roleId}' not found`);
    const shopName = await this.assertShopRole(
      nextRole.name,
      dto.shopId !== undefined ? dto.shopId : existing.shopId,
      id,
    );

    if (dto.email && normalizeEmail(dto.email) !== existing.email) {
      await this.assertEmailAvailable(dto.email, id);
    }

    const passwordHash = dto.password
      ? await hashPassword(dto.password)
      : undefined;

    try {
      await this.database.db
        .update(users)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: normalizeEmail(dto.email) }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.roleId !== undefined && { roleId: dto.roleId }),
          ...(dto.shopId !== undefined && { shopId: dto.shopId }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(passwordHash !== undefined && {
            passwordHash,
            passwordChangedAt: new Date(),
          }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
      return this.getById(id);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw this.uniqueConflict(err, {
          email: dto.email ?? existing.email,
          shopName,
          shopId: dto.shopId ?? existing.shopId,
        });
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findRawById(id);
    if (existing.role?.name === 'OWNER') {
      throw new BadRequestException(
        'Owner accounts cannot be deleted; deactivate instead',
      );
    }
    await this.database.db.delete(users).where(eq(users.id, id));
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.database.db
      .update(users)
      .set({
        passwordHash,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  private async findRawById(id: string): Promise<PublicUserRow> {
    const row = await this.database.db.query.users.findFirst({
      where: eq(users.id, id),
      columns: SELECT_USER_COLUMNS,
      with: { role: { columns: { name: true } } },
    });
    if (!row) throw new NotFoundException(`User '${id}' not found`);
    return row as PublicUserRow;
  }

  private async assertEmailAvailable(
    email: string,
    excludeId: string | null,
  ): Promise<void> {
    const normalized = normalizeEmail(email);
    const existing = await this.database.db.query.users.findFirst({
      where: excludeId
        ? and(eq(users.email, normalized), sql`${users.id} <> ${excludeId}`)
        : eq(users.email, normalized),
      columns: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `User with email '${normalized}' already exists`,
      );
    }
  }

  private async assertShopRole(
    roleName: string,
    shopId: string | null,
    excludeUserId: string | null,
  ): Promise<string | null> {
    if (roleName === 'SHOP' && shopId === null) {
      throw new BadRequestException('SHOP users must have a shopId');
    }
    if (roleName !== 'SHOP' && shopId !== null) {
      throw new BadRequestException('Only SHOP users may have a shopId');
    }
    if (shopId) {
      const shop = await this.database.db.query.shops.findFirst({
        where: eq(shops.id, shopId),
        columns: { id: true, name: true },
      });
      if (!shop) throw new BadRequestException(`Shop '${shopId}' not found`);
      if (roleName === 'SHOP') {
        const existingLogin = await this.database.db.query.users.findFirst({
          where: excludeUserId
            ? and(
                eq(users.shopId, shopId),
                sql`${users.id} <> ${excludeUserId}`,
              )
            : eq(users.shopId, shopId),
          columns: { id: true },
        });
        if (existingLogin) {
          throw this.shopLoginConflict(shop.name);
        }
      }
      return shop.name;
    }
    return null;
  }

  private uniqueConflict(
    err: unknown,
    context: {
      email?: string;
      shopName: string | null;
      shopId?: string | null;
    },
  ): ConflictException {
    switch (getUniqueViolationConstraint(err)) {
      case 'users_email_unique':
        return new ConflictException(
          `User with email '${normalizeEmail(context.email ?? '')}' already exists`,
        );
      case 'users_shop_unique':
        return this.shopLoginConflict(context.shopName ?? context.shopId ?? 'unknown');
      default:
        return new ConflictException('A record with these details already exists');
    }
  }

  private shopLoginConflict(shopNameOrId: string): ConflictException {
    return new ConflictException(
      `Shop '${shopNameOrId}' already has a login user`,
    );
  }
}
