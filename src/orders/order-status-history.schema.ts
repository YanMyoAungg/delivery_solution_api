import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../users/user.schema.js';
import {
  orderStatusEnum,
  orders,
  type AssigneeSnapshot,
} from './order.schema.js';

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    changedBy: uuid('changed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    reason: text('reason'),
    internalNote: text('internal_note'),
    previousAssignee: jsonb(
      'previous_assignee',
    ).$type<AssigneeSnapshot | null>(),
    newAssignee: jsonb('new_assignee').$type<AssigneeSnapshot | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('order_status_history_order_idx').on(table.orderId),
    index('order_status_history_order_created_idx').on(
      table.orderId,
      table.createdAt,
    ),
  ],
);
