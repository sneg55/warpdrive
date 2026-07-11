ALTER TABLE "organizations" ADD COLUMN "labels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "labels" text[] DEFAULT '{}' NOT NULL;