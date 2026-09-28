import { relations } from 'drizzle-orm';
import { users } from '../../users/user.schema.js';
import { roles } from '../../roles/roles.schema.js';
import { permissions } from '../../permissions/permissions.schema.js';
import { role_permissions } from '../../roles/role-permissions.schema.js';
import { orders } from '../../orders/order.schema.js';
import { shops } from '../../shops/shop.schema.js';
import { riders } from '../../riders/rider.schema.js';
import { orderStatusHistory } from '../../orders/order-status-history.schema.js';
import { riderTownships, townships } from '../../townships/township.schema.js';
import {
  deliveryAttempts,
  deliveryAttemptHistory,
} from '../../deliveries/delivery.schema.js';

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

export const ordersRelations = relations(orders, ({ one, many }) => ({
  shop: one(shops, { fields: [orders.shopId], references: [shops.id] }),
  township: one(townships, { fields: [orders.townshipId], references: [townships.id] }),
  history: many(orderStatusHistory),
  deliveryAttempts: many(deliveryAttempts),
}));

export const orderStatusHistoryRelations = relations(
  orderStatusHistory,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderStatusHistory.orderId],
      references: [orders.id],
    }),
  }),
);

export const townshipsRelations = relations(townships, ({ many }) => ({
  riders: many(riderTownships),
  orders: many(orders),
}));

export const riderTownshipsRelations = relations(riderTownships, ({ one }) => ({
  rider: one(riders, {
    fields: [riderTownships.riderId],
    references: [riders.id],
  }),
  township: one(townships, {
    fields: [riderTownships.townshipId],
    references: [townships.id],
  }),
}));

export const deliveryAttemptsRelations = relations(
  deliveryAttempts,
  ({ one, many }) => ({
    order: one(orders, {
      fields: [deliveryAttempts.orderId],
      references: [orders.id],
    }),
    rider: one(riders, {
      fields: [deliveryAttempts.riderId],
      references: [riders.id],
    }),
    assignedByUser: one(users, {
      fields: [deliveryAttempts.assignedBy],
      references: [users.id],
    }),
    history: many(deliveryAttemptHistory),
  }),
);

export const deliveryAttemptHistoryRelations = relations(
  deliveryAttemptHistory,
  ({ one }) => ({
    attempt: one(deliveryAttempts, {
      fields: [deliveryAttemptHistory.deliveryAttemptId],
      references: [deliveryAttempts.id],
    }),
    actor: one(users, {
      fields: [deliveryAttemptHistory.actorId],
      references: [users.id],
    }),
  }),
);
