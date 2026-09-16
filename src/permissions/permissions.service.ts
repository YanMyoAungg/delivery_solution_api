import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import type { PermissionKey } from '../common/auth/permission-keys.js';
import { roles } from './roles.schema.js';
import { permissions } from './permissions.schema.js';
import { role_permissions } from './role-permissions.schema.js';

const CACHE_TTL_MS = 60_000;

/** Name format: `domain` (lowercase, ≤32 chars) `.` `action` (lowercase, ≤128). */
const NAME_PATTERN = /^[a-z][a-z0-9]{0,31}\.[a-z0-9][a-z0-9.]{0,127}$/;

@Injectable()
export class PermissionService {
  constructor(private readonly database: DatabaseService) {}

  private cache: { at: number; grants: Map<string, string[]> } | null = null;

  /** All non-system roleIds → granted permission names. ~60s TTL, bust on write. */
  private async getGrants(): Promise<Map<string, string[]>> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) {
      return this.cache.grants;
    }
    const rows = await this.database.db
      .select({
        roleId: role_permissions.roleId,
        name: permissions.name,
      })
      .from(role_permissions)
      .innerJoin(
        permissions,
        eq(role_permissions.permissionId, permissions.id),
      );
    const grants = new Map<string, string[]>();
    for (const row of rows) {
      const bucket = grants.get(row.roleId) ?? [];
      bucket.push(row.name);
      grants.set(row.roleId, bucket);
    }
    this.cache = { at: now, grants };
    return grants;
  }

  /** Full catalog names, flat (DB is the source of truth for permissions). */
  private async getCatalogNames(): Promise<string[]> {
    const rows = await this.database.db.query.permissions.findMany({
      columns: { name: true },
    });
    return rows.map((r) => r.name);
  }

  /**
   * Effective permission names for a role. System roles (OWNER) always hold
   * the full catalog regardless of `role_permissions` rows.
   */
  async getEffectivePermissions(roleId: string): Promise<string[]> {
    const role = await this.database.db.query.roles.findFirst({
      where: eq(roles.id, roleId),
      columns: { isSystem: true },
    });
    if (!role) throw new NotFoundException(`Role '${roleId}' not found`);
    if (role.isSystem) return this.getCatalogNames();
    const grants = await this.getGrants();
    return [...(grants.get(roleId) ?? [])];
  }

  /** Permission catalog grouped by domain (derived from the name prefix). */
  async getCatalog(): Promise<
    Array<{ domain: string; permissions: string[] }>
  > {
    const rows = await this.database.db
      .select({ name: permissions.name })
      .from(permissions)
      .orderBy(permissions.name);
    const groups: Array<{ domain: string; permissions: string[] }> = [];
    for (const row of rows) {
      const domain = row.name.split('.')[0];
      const last = groups[groups.length - 1];
      if (last && last.domain === domain) {
        last.permissions.push(row.name);
      } else {
        groups.push({ domain, permissions: [row.name] });
      }
    }
    return groups;
  }

  /** Permissions granted to a specific role (system roles → full catalog). */
  async getRoleGrants(roleId: string): Promise<string[]> {
    return this.getEffectivePermissions(roleId);
  }

  /**
   * Replace a role's grant set. Scope:
   * - target isSystem (OWNER) → 403.
   * - target === caller → 403 (no self-empowerment).
   * - caller may only grant names ⊆ caller's own effective permissions.
   * - names must exist in the catalog.
   */
  async setRoleGrants(
    callerRoleId: string,
    targetRoleId: string,
    names: PermissionKey[],
  ): Promise<string[]> {
    if (targetRoleId === callerRoleId) {
      throw new ForbiddenException(
        'You cannot modify your own role permissions',
      );
    }
    await this.assertRoleWritable(callerRoleId, targetRoleId);

    const unknown = await this.filterUnknownNames(names);
    if (unknown.length > 0) {
      throw new NotFoundException(
        `Unknown permission name(s): ${unknown.join(', ')}`,
      );
    }

    const callerEffective = await this.getEffectivePermissions(callerRoleId);
    const missing = names.filter((n) => !callerEffective.includes(n));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `You cannot grant permissions you do not hold: ${missing.join(', ')}`,
      );
    }

    const target = await this.roleOrThrow(targetRoleId);
    const permissionRows =
      names.length === 0
        ? []
        : await this.database.db.query.permissions.findMany({
            where: inArray(permissions.name, [...names]),
            columns: { id: true },
          });
    if (permissionRows.length !== names.length) {
      throw new NotFoundException(
        'One or more permissions are not in the catalog',
      );
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(role_permissions)
        .where(eq(role_permissions.roleId, target.id));
      if (permissionRows.length > 0) {
        await tx.insert(role_permissions).values(
          permissionRows.map((p) => ({
            roleId: target.id,
            permissionId: p.id,
          })),
        );
      }
    });

    this.cache = null;
    return [...names];
  }

  /** Create a catalog entry (validates format; duplicate → 409). */
  async createPermission(input: {
    name: string;
    description?: string | null;
  }): Promise<{ name: string; domain: string }> {
    const name = input.name.trim();
    if (!NAME_PATTERN.test(name)) {
      throw new ForbiddenException(
        'Name must be like "domain.action" (lowercase, digits, dots)',
      );
    }
    try {
      await this.database.db.insert(permissions).values({
        name,
        description: input.description ?? null,
      });
    } catch (err) {
      const code =
        (err as { code?: string }).code ??
        (err as { cause?: { code?: string } }).cause?.code ??
        '';
      if (code === '23505') {
        throw new ConflictException(`Permission '${name}' already exists`);
      }
      throw err;
    }
    return { name, domain: name.split('.')[0] };
  }

  /**
   * Delete a catalog entry. Blocked (409) if any role still grants it — no
   * silent grant revocation.
   */
  async deletePermission(name: string): Promise<void> {
    const perm = await this.database.db.query.permissions.findFirst({
      where: eq(permissions.name, name),
      columns: { id: true },
    });
    if (!perm) throw new NotFoundException(`Permission '${name}' not found`);

    const inUse = await this.database.db.query.role_permissions.findFirst({
      where: eq(role_permissions.permissionId, perm.id),
      columns: { roleId: true },
    });
    if (inUse) {
      throw new ConflictException(
        `Permission '${name}' is granted to a role — revoke it first`,
      );
    }
    await this.database.db
      .delete(permissions)
      .where(eq(permissions.id, perm.id));
    this.cache = null;
  }

  /**
   * Assert a caller may assign/modify a target role (used by roles CRUD and
   * user assignment). System target & caller not system → 403; target name
   * ADMIN & caller not system → 403; target effective ⊆ caller effective.
   */
  async assertCallerCanAssign(
    callerRoleId: string,
    targetRoleId: string,
  ): Promise<void> {
    const caller = await this.roleOrThrow(callerRoleId);
    const target = await this.roleOrThrow(targetRoleId);
    const callerIsOwner = caller.isSystem;

    if (target.isSystem && !callerIsOwner) {
      throw new ForbiddenException(
        'Only the system owner may modify a system role',
      );
    }
    if (target.name === 'ADMIN' && !callerIsOwner) {
      throw new ForbiddenException(
        'Only the owner may assign or modify the ADMIN role',
      );
    }
    if (target.id === caller.id) {
      throw new ForbiddenException('You cannot modify your own role');
    }
    const callerEffective = await this.getEffectivePermissions(callerRoleId);
    const targetEffective = await this.getEffectivePermissions(targetRoleId);
    const over = targetEffective.filter((n) => !callerEffective.includes(n));
    if (over.length > 0) {
      throw new ForbiddenException(
        `Cannot manage a role with permissions you do not hold: ${over.join(', ')}`,
      );
    }
  }

  private async assertRoleWritable(
    callerRoleId: string,
    targetRoleId: string,
  ): Promise<void> {
    const caller = await this.roleOrThrow(callerRoleId);
    const target = await this.roleOrThrow(targetRoleId);
    if (target.isSystem && !caller.isSystem) {
      throw new ForbiddenException('System roles cannot be modified');
    }
    if (target.name === 'ADMIN' && !caller.isSystem) {
      throw new ForbiddenException(
        'The ADMIN role cannot be modified by ADMIN',
      );
    }
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

  private async filterUnknownNames(names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const rows = await this.database.db.query.permissions.findMany({
      where: inArray(permissions.name, names),
      columns: { name: true },
    });
    const known = new Set(rows.map((r) => r.name));
    return names.filter((n) => !known.has(n));
  }
}
