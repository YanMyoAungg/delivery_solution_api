import {
  timestamp,
  uniqueIndex,
  uuid,
  pgTable,
} from 'drizzle-orm/pg-core';
import { users } from '../users/user.schema.js';

export const riders = pgTable(
  'riders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('riders_user_unique').on(table.userId)],
);
