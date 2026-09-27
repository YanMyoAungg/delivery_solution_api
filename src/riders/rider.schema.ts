import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../users/user.schema.js';

export const RIDER_VEHICLE_TYPES = [
  'BIKE',
  'MOTORBIKE',
  'CAR',
  'OTHER',
] as const;
export type RiderVehicleType = (typeof RIDER_VEHICLE_TYPES)[number];

export const riderVehicleTypeEnum = pgEnum(
  'rider_vehicle_type',
  RIDER_VEHICLE_TYPES,
);

/** PK = FK to users.id — enforces the 1:1 rider↔user pairing at the DB level. */
export const riders = pgTable('riders', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  licenseNo: text('license_no'),
  vehicleType: riderVehicleTypeEnum('vehicle_type').notNull().default('BIKE'),
  vehiclePlate: text('vehicle_plate'),
  nrcNumber: text('nrc_number'),
  emergencyContactPhone: text('emergency_contact_phone'),
  isAvailable: boolean('is_available').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
