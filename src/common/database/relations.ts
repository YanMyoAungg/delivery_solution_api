import { relations } from 'drizzle-orm';
import { users } from '../../users/user.schema.js';
import { roles } from '../../roles/roles.schema.js';
import { permissions } from '../../permissions/permissions.schema.js';
import { role_permissions } from '../../roles/role-permissions.schema.js';

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  permissions: many(role_permissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(role_permissions),
}));

export const rolePermissionsRelations = relations(
  role_permissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [role_permissions.roleId],
      references: [roles.id],
    }),
    permission: one(permissions, {
      fields: [role_permissions.permissionId],
      references: [permissions.id],
    }),
  }),
);
