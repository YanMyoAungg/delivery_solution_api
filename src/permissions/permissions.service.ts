import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '../common/auth/permission-keys.js';
import { roles } from '../roles/roles.schema.js';
import { permissions } from './permissions.schema.js';
import { role_permissions } from '../roles/role-permissions.schema.js';

const CACHE_TTL_MS = 60_000;

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

  /** Fixed permission catalog grouped by its stored module column. */
  async getCatalog(): Promise<
    Array<{ module: string; permissions: string[] }>
  > {
    const rows = await this.database.db
      .select({ module: permissions.module, name: permissions.name })
      .from(permissions)
      .orderBy(permissions.module, permissions.name);
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      const bucket = groups.get(row.module) ?? [];
      bucket.push(row.name);
      groups.set(row.module, bucket);
    }
    return [...groups.entries()].map(([module, modulePermissions]) => ({
      module,
      permissions: modulePermissions,
    }));
  }

  /**
   * Replace a role's grant set. Scope:
   * - target === caller → 403 (no self-empowerment).
   * - target isSystem (OWNER) / ADMIN → 403 unless caller is system.
   * - names must exist in the fixed catalog.
   * - caller may only grant names ⊆ caller's own effective permissions.
   */
  async setRoleGrants(
    callerRoleId: string,
    targetRoleId: string,
    names: PermissionKey[],
  ): Promise<string[]> {
    await this.assertCallerCanAssign(callerRoleId, targetRoleId);

    const known = new Set<string>(PERMISSION_KEYS);
    const unknown = names.filter((name) => !known.has(name));
    if (unknown.length > 0) {
      throw new NotFoundException(
        `Unknown permission name(s): ${unknown.join(', ')}`,
      );
    }

    const callerEffective = await this.getEffectivePermissions(callerRoleId);
    const missing = names.filter((name) => !callerEffective.includes(name));
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
          permissionRows.map((permission) => ({
            roleId: target.id,
            permissionId: permission.id,
          })),
        );
      }
    });

    this.cache = null;
    return [...names];
  }

  /**
   * Assert a caller may assign/modify a target role (used by roles CRUD, user
   * assignment, and grant replacement). System target & caller not system →
   * 403; target name ADMIN & caller not system → 403; self → 403; target
   * effective ⊆ caller effective.
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
    const over = targetEffective.filter(
      (name) => !callerEffective.includes(name),
    );
    if (over.length > 0) {
      throw new ForbiddenException(
        `Cannot manage a role with permissions you do not hold: ${over.join(', ')}`,
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
}
