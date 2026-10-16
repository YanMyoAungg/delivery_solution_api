import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { roles } from '../roles/roles.schema.js';
import { shops } from '../shops/shop.schema.js';

export const USER_ROLES = [
  'OWNER',
  'ADMIN',
  'OFFICER',
  'RIDER',
  'SHOP',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const userStatusEnum = pgEnum('user_status', USER_STATUSES);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    passwordHash: text('password_hash').notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    shopId: uuid('shop_id').references(() => shops.id, {
      onDelete: 'restrict',
    }),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    uniqueIndex('users_shop_unique').on(table.shopId),
    index('users_role_idx').on(table.roleId),
  ],
);
