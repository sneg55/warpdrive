ALTER TABLE "email_threads" ADD COLUMN "follow_up_status" text;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "labels" text[] DEFAULT '{}' NOT NULL;