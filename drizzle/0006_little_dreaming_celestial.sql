CREATE TYPE "public"."shop_channel_type" AS ENUM('VIBER', 'TELEGRAM');--> statement-breakpoint
CREATE TYPE "public"."rider_vehicle_type" AS ENUM('BIKE', 'MOTORBIKE', 'CAR', 'OTHER');--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"notes" text,
	"channel_type" "shop_channel_type" NOT NULL,
	"channel_name" text NOT NULL,
	"chat_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "riders" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"license_no" text,
	"vehicle_type" "rider_vehicle_type" DEFAULT 'BIKE' NOT NULL,
	"vehicle_plate" text,
	"nrc_number" text,
	"emergency_contact_phone" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "riders" ADD CONSTRAINT "riders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shops_name_unique" ON "shops" USING btree ("name");--> statement-breakpoint
CREATE INDEX "shops_channel_type_idx" ON "shops" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");