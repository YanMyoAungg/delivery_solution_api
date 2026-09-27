DROP INDEX "pickup_orders_order_unique";--> statement-breakpoint
ALTER TABLE "pickup_orders" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_orders_active_order_unique" ON "pickup_orders" USING btree ("order_id") WHERE "pickup_orders"."active" = true;