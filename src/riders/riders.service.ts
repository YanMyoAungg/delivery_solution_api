import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { escapeLikeWildcards } from '../common/utils/normalize.util.js';
import { hashPassword } from '../common/utils/password.util.js';
import { roles } from '../roles/roles.schema.js';
import { users, type UserStatus } from '../users/user.schema.js';
import { riders } from './rider.schema.js';
import { CreateRiderDto } from './dto/create-rider.dto.js';
import { UpdateRiderDto } from './dto/update-rider.dto.js';
import { ListRidersQueryDto } from './dto/list-riders-query.dto.js';
import { RiderResponseDto, RiderUserDto } from './dto/rider-response.dto.js';
import { RiderListResponseDto } from './dto/rider-list-response.dto.js';

const RIDER_ROLE_NAME = 'RIDER';

type RiderRow = typeof riders.$inferSelect;
type UserRow = typeof users.$inferSelect;

function toRiderUser(row: UserRow): RiderUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status as UserStatus,
  };
}

function toRiderResponse(rider: RiderRow, user: UserRow): RiderResponseDto {
  return {
    userId: rider.userId,
    licenseNo: rider.licenseNo,
    vehicleType: rider.vehicleType,
    vehiclePlate: rider.vehiclePlate,
    nrcNumber: rider.nrcNumber,
    emergencyContactPhone: rider.emergencyContactPhone,
    isAvailable: rider.isAvailable,
    notes: rider.notes,
    createdAt: rider.createdAt.toISOString(),
    updatedAt: rider.updatedAt.toISOString(),
    user: toRiderUser(user),
  };
}

@Injectable()
export class RidersService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListRidersQueryDto): Promise<RiderListResponseDto> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;

    const conditions = [];
    if (query.search?.trim()) {
      const term = `%${escapeLikeWildcards(query.search.trim())}%`;
      conditions.push(
        or(
          ilike(users.name, term),
          ilike(users.email, term),
          ilike(users.phone, term),
        ),
      );
    }
    if (query.vehicleType) {
      conditions.push(eq(riders.vehicleType, query.vehicleType));
    }
    if (query.isAvailable !== undefined) {
      conditions.push(eq(riders.isAvailable, query.isAvailable));
    }
    if (query.status) {
      conditions.push(eq(users.status, query.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.database.db
        .select({ rider: riders, user: users })
        .from(riders)
        .innerJoin(users, eq(riders.userId, users.id))
        .where(where)
        .orderBy(asc(riders.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(riders)
        .innerJoin(users, eq(riders.userId, users.id))
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return {
      data: rows.map((row) => toRiderResponse(row.rider, row.user)),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  async getById(id: string): Promise<RiderResponseDto> {
    const row = await this.findRawById(id);
    return toRiderResponse(row.rider, row.user);
  }

  async create(dto: CreateRiderDto): Promise<RiderResponseDto> {
    try {
      return await this.database.db.transaction(async (tx) => {
        const riderRole = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, RIDER_ROLE_NAME))
          .limit(1);
        if (!riderRole[0]) {
          throw new NotFoundException(
            `Rider role '${RIDER_ROLE_NAME}' missing — run 'pnpm db:seed'`,
          );
        }

        const passwordHash = await hashPassword(dto.password);

        const insertedUser = await tx
          .insert(users)
          .values({
            name: dto.name,
            email: dto.email,
            phone: dto.phone ?? null,
            passwordHash,
            roleId: riderRole[0].id,
            status: dto.status ?? 'ACTIVE',
            passwordChangedAt: new Date(),
          })
          .returning({ id: users.id });

        const riderId = insertedUser[0].id;

        await tx.insert(riders).values({
          userId: riderId,
          licenseNo: dto.licenseNo ?? null,
          vehicleType: dto.vehicleType ?? 'BIKE',
          vehiclePlate: dto.vehiclePlate ?? null,
          nrcNumber: dto.nrcNumber ?? null,
          emergencyContactPhone: dto.emergencyContactPhone ?? null,
          isAvailable: dto.isAvailable ?? true,
          notes: dto.notes ?? null,
        });

        const result = await tx
          .select({ rider: riders, user: users })
          .from(riders)
          .innerJoin(users, eq(riders.userId, users.id))
          .where(eq(riders.userId, riderId))
          .limit(1);

        return toRiderResponse(result[0].rider, result[0].user);
        // ponytail: no audit log / welcome notification; add when a consumers phase needs it
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Rider with email '${dto.email}' already exists`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateRiderDto): Promise<RiderResponseDto> {
    return this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ rider: riders, user: users })
        .from(riders)
        .innerJoin(users, eq(riders.userId, users.id))
        .where(eq(riders.userId, id))
        .limit(1);
      if (!existing[0]) {
        throw new NotFoundException(`Rider '${id}' not found`);
      }

      // User half: name/phone/status only.
      await tx
        .update(users)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.status !== undefined && { status: dto.status }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      // Rider half: profile fields + availability.
      await tx
        .update(riders)
        .set({
          ...(dto.licenseNo !== undefined && { licenseNo: dto.licenseNo }),
          ...(dto.vehicleType !== undefined && {
            vehicleType: dto.vehicleType,
          }),
          ...(dto.vehiclePlate !== undefined && {
            vehiclePlate: dto.vehiclePlate,
          }),
          ...(dto.nrcNumber !== undefined && { nrcNumber: dto.nrcNumber }),
          ...(dto.emergencyContactPhone !== undefined && {
            emergencyContactPhone: dto.emergencyContactPhone,
          }),
          ...(dto.isAvailable !== undefined && {
            isAvailable: dto.isAvailable,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          updatedAt: new Date(),
        })
        .where(eq(riders.userId, id));

      const updated = await tx
        .select({ rider: riders, user: users })
        .from(riders)
        .innerJoin(users, eq(riders.userId, users.id))
        .where(eq(riders.userId, id))
        .limit(1);

      return toRiderResponse(updated[0].rider, updated[0].user);
    });
  }

  async remove(id: string): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ userId: riders.userId })
        .from(riders)
        .where(eq(riders.userId, id))
        .limit(1);
      if (!existing[0]) {
        throw new NotFoundException(`Rider '${id}' not found`);
      }
      await tx.delete(riders).where(eq(riders.userId, id));
      await tx.delete(users).where(eq(users.id, id));
    });
  }

  private async findRawById(
    id: string,
  ): Promise<{ rider: RiderRow; user: UserRow }> {
    const row = await this.database.db
      .select({ rider: riders, user: users })
      .from(riders)
      .innerJoin(users, eq(riders.userId, users.id))
      .where(eq(riders.userId, id))
      .limit(1);
    if (!row[0]) throw new NotFoundException(`Rider '${id}' not found`);
    return row[0];
  }
}
