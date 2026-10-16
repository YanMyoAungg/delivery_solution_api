CREATE TYPE "public"."township_default_assignee_type" AS ENUM('RIDER', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."assignee_type" AS ENUM('RIDER', 'PARTNER');--> statement-breakpoint
CREATE TABLE "townships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_delivery_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"default_assignee_type" "township_default_assignee_type",
	"default_rider_id" uuid,
	"default_partner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "townships_default_assignee_consistency_check" CHECK (("townships"."default_assignee_type" is null and "townships"."default_rider_id" is null and "townships"."default_partner_id" is null) or ("townships"."default_assignee_type" = 'RIDER' and "townships"."default_rider_id" is not null and "townships"."default_partner_id" is null) or ("townships"."default_assignee_type" = 'PARTNER' and "townships"."default_partner_id" is not null and "townships"."default_rider_id" is null))
);
--> statement-breakpoint
CREATE TABLE "delivery_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rider_id" uuid NOT NULL,
	"way_date" date NOT NULL,
	"commission_rate" numeric(12, 2) DEFAULT '500' NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"is_paid_without_delivery" boolean DEFAULT false NOT NULL,
	"pay_anyway_reason" text,
	"pay_anyway_by" uuid,
	"pay_anyway_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_field_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"actor_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" numeric(12, 2) DEFAULT '500' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pickup_orders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pickups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_attempt_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_attempts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "pickup_orders" CASCADE;--> statement-breakpoint
DROP TABLE "pickups" CASCADE;--> statement-breakpoint
DROP TABLE "delivery_attempt_history" CASCADE;--> statement-breakpoint
DROP TABLE "delivery_attempts" CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::text;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "from_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "to_status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'ASSIGNED', 'AWAITING_APPROVAL', 'DELIVERED', 'RETURNED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "from_status" SET DATA TYPE "public"."order_status" USING "from_status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "to_status" SET DATA TYPE "public"."order_status" USING "to_status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shop_id" uuid;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "commission_per_way_override" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "township_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assignee_type" "assignee_type";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rider_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "partner_tracking_no" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "package_price" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_package_paid_to_shop" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_fee_paid_to_shop" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "partner_fee" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "estimated_delivery_date" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "way_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD COLUMN "internal_note" text;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD COLUMN "previous_assignee" jsonb;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD COLUMN "new_assignee" jsonb;--> statement-breakpoint
ALTER TABLE "townships" ADD CONSTRAINT "townships_default_rider_id_riders_id_fk" FOREIGN KEY ("default_rider_id") REFERENCES "public"."riders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "townships" ADD CONSTRAINT "townships_default_partner_id_delivery_partners_id_fk" FOREIGN KEY ("default_partner_id") REFERENCES "public"."delivery_partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ways" ADD CONSTRAINT "ways_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ways" ADD CONSTRAINT "ways_pay_anyway_by_users_id_fk" FOREIGN KEY ("pay_anyway_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_audit" ADD CONSTRAINT "order_field_audit_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_audit" ADD CONSTRAINT "order_field_audit_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "townships_name_unique" ON "townships" USING btree ("name");--> statement-breakpoint
CREATE INDEX "townships_default_rider_idx" ON "townships" USING btree ("default_rider_id");--> statement-breakpoint
CREATE INDEX "townships_default_partner_idx" ON "townships" USING btree ("default_partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_partners_name_unique" ON "delivery_partners" USING btree ("name");--> statement-breakpoint
CREATE INDEX "delivery_partners_active_idx" ON "delivery_partners" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "ways_open_rider_date_unique" ON "ways" USING btree ("rider_id","way_date") WHERE "ways"."is_open" = true;--> statement-breakpoint
CREATE INDEX "ways_rider_date_idx" ON "ways" USING btree ("rider_id","way_date");--> statement-breakpoint
CREATE INDEX "order_field_audit_order_created_idx" ON "order_field_audit" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_field_audit_actor_idx" ON "order_field_audit" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_settings_key_unique" ON "app_settings" USING btree ("key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_township_id_townships_id_fk" FOREIGN KEY ("township_id") REFERENCES "public"."townships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_partner_id_delivery_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."delivery_partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_way_id_ways_id_fk" FOREIGN KEY ("way_id") REFERENCES "public"."ways"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_shop_unique" ON "users" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "orders_delivered_at_idx" ON "orders" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "orders_township_idx" ON "orders" USING btree ("township_id");--> statement-breakpoint
CREATE INDEX "orders_rider_idx" ON "orders" USING btree ("rider_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignee_consistency_check" CHECK (("orders"."assignee_type" is null and "orders"."rider_id" is null and "orders"."partner_id" is null) or ("orders"."assignee_type" = 'RIDER' and "orders"."rider_id" is not null and "orders"."partner_id" is null) or ("orders"."assignee_type" = 'PARTNER' and "orders"."partner_id" is not null and "orders"."rider_id" is null));--> statement-breakpoint
DROP TYPE "public"."pickup_status";--> statement-breakpoint
DROP TYPE "public"."delivery_history_event";--> statement-breakpoint
DROP TYPE "public"."delivery_status";--> statement-breakpoint
DROP TYPE "public"."failure_reason";