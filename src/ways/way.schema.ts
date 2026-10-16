import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { riders } from '../riders/rider.schema.js';
import { users } from '../users/user.schema.js';

export const ways = pgTable(
  'ways',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    riderId: uuid('rider_id')
      .notNull()
      .references(() => riders.id, { onDelete: 'restrict' }),
    wayDate: date('way_date', { mode: 'string' }).notNull(),
    commissionRate: numeric('commission_rate', { precision: 12, scale: 2 })
      .notNull()
      .default('500'),
    isOpen: boolean('is_open').notNull().default(true),
    isPaidWithoutDelivery: boolean('is_paid_without_delivery')
      .notNull()
      .default(false),
    payAnywayReason: text('pay_anyway_reason'),
    payAnywayBy: uuid('pay_anyway_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    payAnywayAt: timestamp('pay_anyway_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('ways_open_rider_date_unique')
      .on(table.riderId, table.wayDate)
      .where(sql`${table.isOpen} = true`),
    index('ways_rider_date_idx').on(table.riderId, table.wayDate),
  ],
);
