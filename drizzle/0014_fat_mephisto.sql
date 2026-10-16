DROP TABLE "pickup_orders" CASCADE;--> statement-breakpoint
DROP TABLE "pickups" CASCADE;--> statement-breakpoint
DROP TYPE "public"."pickup_status";
--> statement-breakpoint
DELETE FROM "permissions" WHERE "name" LIKE 'pickups.%';
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."name" = 'OFFICER'
  AND "permissions"."name" IN ('orders.create', 'orders.read', 'orders.update')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
