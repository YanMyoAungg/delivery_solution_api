DROP TABLE "rider_townships" CASCADE;--> statement-breakpoint
DROP TABLE "township_rotation" CASCADE;--> statement-breakpoint
ALTER TABLE "townships" ADD COLUMN "default_delivery_fee" numeric(12, 2) DEFAULT '0' NOT NULL;