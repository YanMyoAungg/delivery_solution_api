import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { PermissionService } from '../permissions/permissions.service.js';
import { roles } from '../permissions/roles.schema.js';
import { users } from '../users/user.schema.js';
import { RoleResponseDto } from './dto/roles-response.dto.js';

@Injectable()
export class RolesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionService,
  ) {}

  /** List roles with a computed user count. */
  async list(): Promise<RoleResponseDto[]> {
    const rows = await this.database.db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        isSystem: roles.isSystem,
        userCount: sql<number>`count(${users.id})`,
      })
      .from(roles)
      .leftJoin(users, eq(users.roleId, roles.id))
      .groupBy(roles.id)
      .orderBy(roles.name);
    return rows.map((r) => ({ ...r, userCount: Number(r.userCount) }));
  }

  async getById(id: string): Promise<RoleResponseDto> {
    const row = await this.roleOrThrow(id);
    const userCount = Number(
      (
        await this.database.db
          .select({ c: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.roleId, id))
      )[0]?.c ?? 0,
    );
    return { ...row, userCount };
  }

  async create(
    callerRoleId: string,
    body: { name: string; description?: string | null },
  ): Promise<{ id: string; name: string; isSystem: boolean }> {
    const name = body.name.trim();
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(name)) {
      throw new ForbiddenException(
        'Role name must be uppercase, 2-32 chars, letters/digits/underscore',
      );
    }
    try {
      const [row] = await this.database.db
        .insert(roles)
        .values({ name, description: body.description ?? null })
        .returning({
          id: roles.id,
          name: roles.name,
          isSystem: roles.isSystem,
        });
      return row;
    } catch (err) {
      const code =
        (err as { code?: string }).code ??
        (err as { cause?: { code?: string } }).cause?.code ??
        '';
      if (code === '23505') {
        throw new ConflictException(`Role '${name}' already exists`);
      }
      throw err;
    }
  }

  /** Description-only edit. System roles + caller's own role are protected. */
  async update(
    callerRoleId: string,
    targetRoleId: string,
    body: { description?: string | null },
  ): Promise<{ id: string }> {
    const target = await this.roleOrThrow(targetRoleId);
    await this.permissions.assertCallerCanAssign(callerRoleId, target.id);

    const [row] = await this.database.db
      .update(roles)
      .set({ description: body.description ?? null })
      .where(eq(roles.id, target.id))
      .returning({ id: roles.id });
    return row;
  }

  async remove(callerRoleId: string, targetRoleId: string): Promise<void> {
    const target = await this.roleOrThrow(targetRoleId);
    await this.permissions.assertCallerCanAssign(callerRoleId, target.id);

    // Block deleting a role still assigned to users — no silent demotion.
    const assigned = Number(
      (
        await this.database.db
          .select({ c: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.roleId, target.id))
      )[0]?.c ?? 0,
    );
    if (assigned > 0) {
      throw new ConflictException(
        `${assigned} user(s) still have role '${target.name}'. Reassign or delete them first.`,
      );
    }

    // role_permissions rows cascade on role delete (FK onDelete cascade).
    await this.database.db.delete(roles).where(eq(roles.id, target.id));
  }

  private async roleOrThrow(
    roleId: string,
  ): Promise<typeof roles.$inferSelect> {
    const row = await this.database.db.query.roles.findFirst({
      where: eq(roles.id, roleId),
    });
    if (!row) throw new NotFoundException(`Role '${roleId}' not found`);
    return row;
  }
}
