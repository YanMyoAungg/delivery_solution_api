CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"domain" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
DROP INDEX "users_role_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role_id" uuid;--> statement-breakpoint
-- Seed the four roles so the backfill below can map users.role_id.
INSERT INTO "roles" ("name", "description") VALUES
  ('OWNER', 'System owner — all permissions'),
  ('ADMIN', 'Administrator — delegates OFFICER/RIDER'),
  ('OFFICER', 'Officer'),
  ('RIDER', 'Rider') ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- Backfill role_id from the legacy enum role column.
UPDATE "users" SET "role_id" = r."id"
  FROM "roles" r
  WHERE "users"."role_id" IS NULL AND "users"."role"::text = r."name";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
DROP TYPE "public"."user_role";