import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { customers } from '../customers/customer.schema.js';
import { shops } from '../shops/shop.schema.js';

export const ORDER_STATUSES = [
  'PENDING',
  'PICKED_UP',
  'RECEIVED_AT_OFFICE',
  'ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trackingCode: text('tracking_code').notNull(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    packageInfo: jsonb('package_info'),
    deliveryFee: numeric('delivery_fee', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    codAmount: numeric('cod_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    status: orderStatusEnum('status').notNull().default('PENDING'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('orders_tracking_code_unique').on(table.trackingCode),
    index('orders_status_idx').on(table.status),
    index('orders_shop_idx').on(table.shopId),
    index('orders_customer_idx').on(table.customerId),
    index('orders_created_at_idx').on(table.createdAt),
    index('orders_status_created_at_idx').on(table.status, table.createdAt),
  ],
);
