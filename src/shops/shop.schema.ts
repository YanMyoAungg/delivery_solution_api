import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const SHOP_CHANNEL_TYPES = ['VIBER', 'TELEGRAM'] as const;
export type ShopChannelType = (typeof SHOP_CHANNEL_TYPES)[number];

export const shopChannelTypeEnum = pgEnum(
  'shop_channel_type',
  SHOP_CHANNEL_TYPES,
);

export const shops = pgTable(
  'shops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    channelType: shopChannelTypeEnum('channel_type').notNull(),
    channelName: text('channel_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('shops_name_unique').on(table.name),
    index('shops_name_idx').on(table.name),
    index('shops_channel_type_idx').on(table.channelType),
  ],
);
