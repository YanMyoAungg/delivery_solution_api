CREATE TYPE "public"."pickup_status" AS ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."delivery_history_event" AS ENUM('ASSIGNED', 'REASSIGNED', 'STARTED', 'DELIVERED', 'FAILED', 'RETRY_CREATED');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."failure_reason" AS ENUM('CUSTOMER_UNAVAILABLE', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED', 'CUSTOMER_RESCHEDULED', 'DAMAGED_PACKAGE', 'OTHER');--> statement-breakpoint
CREATE TABLE "pickup_orders" (
	"pickup_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	CONSTRAINT "pickup_orders_pickup_id_order_id_pk" PRIMARY KEY("pickup_id","order_id")
);
--> statement-breakpoint
CREATE TABLE "pickups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "pickup_status" DEFAULT 'SCHEDULED' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_attempt_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_attempt_id" uuid NOT NULL,
	"event" "delivery_history_event" NOT NULL,
	"actor_id" uuid,
	"previous_rider_id" uuid,
	"new_rider_id" uuid,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"rider_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "delivery_status" DEFAULT 'ASSIGNED' NOT NULL,
	"failure_reason" "failure_reason",
	"failure_note" text,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pickup_orders" ADD CONSTRAINT "pickup_orders_pickup_id_pickups_id_fk" FOREIGN KEY ("pickup_id") REFERENCES "public"."pickups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_orders" ADD CONSTRAINT "pickup_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt_history" ADD CONSTRAINT "delivery_attempt_history_delivery_attempt_id_delivery_attempts_id_fk" FOREIGN KEY ("delivery_attempt_id") REFERENCES "public"."delivery_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt_history" ADD CONSTRAINT "delivery_attempt_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt_history" ADD CONSTRAINT "delivery_attempt_history_previous_rider_id_riders_id_fk" FOREIGN KEY ("previous_rider_id") REFERENCES "public"."riders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt_history" ADD CONSTRAINT "delivery_attempt_history_new_rider_id_riders_id_fk" FOREIGN KEY ("new_rider_id") REFERENCES "public"."riders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_orders_order_unique" ON "pickup_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "pickup_orders_order_idx" ON "pickup_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "pickups_status_scheduled_idx" ON "pickups" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pickups_creator_idempotency_unique" ON "pickups" USING btree ("created_by","idempotency_key");--> statement-breakpoint
CREATE INDEX "delivery_attempt_history_attempt_created_idx" ON "delivery_attempt_history" USING btree ("delivery_attempt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempts_order_attempt_unique" ON "delivery_attempts" USING btree ("order_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempts_one_active_order_unique" ON "delivery_attempts" USING btree ("order_id") WHERE "delivery_attempts"."status" in ('ASSIGNED', 'OUT_FOR_DELIVERY');--> statement-breakpoint
CREATE INDEX "delivery_attempts_order_created_idx" ON "delivery_attempts" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "delivery_attempts_rider_status_idx" ON "delivery_attempts" USING btree ("rider_id","status");