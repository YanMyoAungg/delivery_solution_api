import {
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const townships = pgTable('townships', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  defaultDeliveryFee: numeric('default_delivery_fee', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
