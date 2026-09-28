import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { riders } from '../riders/rider.schema.js';

export const townships = pgTable('townships', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const riderTownships = pgTable(
  'rider_townships',
  {
    riderId: uuid('rider_id')
      .notNull()
      .references(() => riders.id, { onDelete: 'cascade' }),
    townshipId: uuid('township_id')
      .notNull()
      .references(() => townships.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.riderId, table.townshipId] }),
    index('rider_townships_township_idx').on(table.townshipId),
  ],
);

export const townshipRotation = pgTable('township_rotation', {
  townshipId: uuid('township_id')
    .primaryKey()
    .references(() => townships.id, { onDelete: 'cascade' }),
  lastAssignedRiderId: uuid('last_assigned_rider_id').references(
    () => riders.id,
    { onDelete: 'set null' },
  ),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
