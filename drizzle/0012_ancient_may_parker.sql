CREATE TYPE "public"."shop_channel_type" AS ENUM('VIBER', 'TELEGRAM');--> statement-breakpoint
CREATE TYPE "public"."rider_vehicle_type" AS ENUM('BIKE', 'MOTORBIKE', 'CAR', 'OTHER');--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "channel_type" "shop_channel_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "channel_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "vehicle_type" "rider_vehicle_type" DEFAULT 'BIKE' NOT NULL;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "vehicle_plate" text;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "license_no" text;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "nrc_number" text;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "emergency_contact_phone" text;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE INDEX "shops_channel_type_idx" ON "shops" USING btree ("channel_type");