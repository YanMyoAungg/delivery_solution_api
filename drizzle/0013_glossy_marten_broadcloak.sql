CREATE TABLE "rider_townships" (
	"rider_id" uuid NOT NULL,
	"township_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rider_townships_rider_id_township_id_pk" PRIMARY KEY("rider_id","township_id")
);
--> statement-breakpoint
CREATE TABLE "township_rotation" (
	"township_id" uuid PRIMARY KEY NOT NULL,
	"last_assigned_rider_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "townships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "townships_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED'::text;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "from_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "to_status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('ASSIGNED', 'DELIVERED', 'FAILED');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "from_status" SET DATA TYPE "public"."order_status" USING "from_status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "to_status" SET DATA TYPE "public"."order_status" USING "to_status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "delivery_attempt_history" ALTER COLUMN "event" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."delivery_history_event";--> statement-breakpoint
CREATE TYPE "public"."delivery_history_event" AS ENUM('ASSIGNED', 'REASSIGNED', 'DELIVERED', 'FAILED', 'RETRY_CREATED');--> statement-breakpoint
ALTER TABLE "delivery_attempt_history" ALTER COLUMN "event" SET DATA TYPE "public"."delivery_history_event" USING "event"::"public"."delivery_history_event";--> statement-breakpoint
DROP INDEX "delivery_attempts_one_active_order_unique";--> statement-breakpoint
ALTER TABLE "delivery_attempts" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED'::text;--> statement-breakpoint
DROP TYPE "public"."delivery_status";--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('ASSIGNED', 'DELIVERED', 'FAILED');--> statement-breakpoint
ALTER TABLE "delivery_attempts" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED'::"public"."delivery_status";--> statement-breakpoint
ALTER TABLE "delivery_attempts" ALTER COLUMN "status" SET DATA TYPE "public"."delivery_status" USING "status"::"public"."delivery_status";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "township_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "rider_townships" ADD CONSTRAINT "rider_townships_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_townships" ADD CONSTRAINT "rider_townships_township_id_townships_id_fk" FOREIGN KEY ("township_id") REFERENCES "public"."townships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "township_rotation" ADD CONSTRAINT "township_rotation_township_id_townships_id_fk" FOREIGN KEY ("township_id") REFERENCES "public"."townships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "township_rotation" ADD CONSTRAINT "township_rotation_last_assigned_rider_id_riders_id_fk" FOREIGN KEY ("last_assigned_rider_id") REFERENCES "public"."riders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rider_townships_township_idx" ON "rider_townships" USING btree ("township_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_township_id_townships_id_fk" FOREIGN KEY ("township_id") REFERENCES "public"."townships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_township_created_at_idx" ON "orders" USING btree ("township_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempts_one_active_order_unique" ON "delivery_attempts" USING btree ("order_id") WHERE "delivery_attempts"."status" = 'ASSIGNED';--> statement-breakpoint
ALTER TABLE "delivery_attempts" DROP COLUMN "started_at";
