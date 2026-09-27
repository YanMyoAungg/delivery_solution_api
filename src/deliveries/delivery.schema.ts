import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orders } from '../orders/order.schema.js';
import { riders } from '../riders/rider.schema.js';
import { users } from '../users/user.schema.js';

export const DELIVERY_STATUSES = [
  'ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const FAILURE_REASONS = [
  'CUSTOMER_UNAVAILABLE',
  'WRONG_ADDRESS',
  'CUSTOMER_REFUSED',
  'CUSTOMER_RESCHEDULED',
  'DAMAGED_PACKAGE',
  'OTHER',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const DELIVERY_HISTORY_EVENTS = [
  'ASSIGNED',
  'REASSIGNED',
  'STARTED',
  'DELIVERED',
  'FAILED',
  'RETRY_CREATED',
] as const;
export type DeliveryHistoryEvent = (typeof DELIVERY_HISTORY_EVENTS)[number];

export const deliveryStatusEnum = pgEnum('delivery_status', DELIVERY_STATUSES);
export const failureReasonEnum = pgEnum('failure_reason', FAILURE_REASONS);
export const deliveryHistoryEventEnum = pgEnum(
  'delivery_history_event',
  DELIVERY_HISTORY_EVENTS,
);

export const deliveryAttempts = pgTable(
  'delivery_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    riderId: uuid('rider_id')
      .notNull()
      .references(() => riders.id, { onDelete: 'restrict' }),
    attemptNumber: integer('attempt_number').notNull(),
    status: deliveryStatusEnum('status').notNull().default('ASSIGNED'),
    failureReason: failureReasonEnum('failure_reason'),
    failureNote: text('failure_note'),
    assignedBy: uuid('assigned_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('delivery_attempts_order_attempt_unique').on(
      table.orderId,
      table.attemptNumber,
    ),
    uniqueIndex('delivery_attempts_one_active_order_unique')
      .on(table.orderId)
      .where(sql`${table.status} in ('ASSIGNED', 'OUT_FOR_DELIVERY')`),
    index('delivery_attempts_order_created_idx').on(
      table.orderId,
      table.createdAt,
    ),
    index('delivery_attempts_rider_status_idx').on(table.riderId, table.status),
  ],
);

export const deliveryAttemptHistory = pgTable(
  'delivery_attempt_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryAttemptId: uuid('delivery_attempt_id')
      .notNull()
      .references(() => deliveryAttempts.id, { onDelete: 'restrict' }),
    event: deliveryHistoryEventEnum('event').notNull(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    previousRiderId: uuid('previous_rider_id').references(() => riders.id, {
      onDelete: 'set null',
    }),
    newRiderId: uuid('new_rider_id').references(() => riders.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('delivery_attempt_history_attempt_created_idx').on(
      table.deliveryAttemptId,
      table.createdAt,
    ),
  ],
);
