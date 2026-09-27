import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../users/user.schema.js';
import { orders } from '../orders/order.schema.js';
import { sql } from 'drizzle-orm';

export const PICKUP_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
export type PickupStatus = (typeof PICKUP_STATUSES)[number];

export const pickupStatusEnum = pgEnum('pickup_status', PICKUP_STATUSES);

export const pickups = pgTable(
  'pickups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: pickupStatusEnum('status').notNull().default('SCHEDULED'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('pickups_status_scheduled_idx').on(table.status, table.scheduledAt),
    uniqueIndex('pickups_creator_idempotency_unique').on(
      table.createdBy,
      table.idempotencyKey,
    ),
  ],
);

export const pickupOrders = pgTable(
  'pickup_orders',
  {
    pickupId: uuid('pickup_id')
      .notNull()
      .references(() => pickups.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    primaryKey({ columns: [table.pickupId, table.orderId] }),
    uniqueIndex('pickup_orders_active_order_unique')
      .on(table.orderId)
      .where(sql`${table.active} = true`),
    index('pickup_orders_order_idx').on(table.orderId),
  ],
);
