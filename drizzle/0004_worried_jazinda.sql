ALTER TABLE "permissions" RENAME COLUMN "key" TO "name";--> statement-breakpoint
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_key_unique";--> statement-breakpoint
ALTER TABLE "permissions" DROP COLUMN "domain";--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_name_unique" UNIQUE("name");