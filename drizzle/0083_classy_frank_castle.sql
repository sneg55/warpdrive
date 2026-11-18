CREATE TYPE "public"."email_provider" AS ENUM('gmail', 'agentic_inbox');--> statement-breakpoint
ALTER TYPE "public"."email_send_status" ADD VALUE 'waiting_for_limit';--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "provider" "email_provider" DEFAULT 'gmail' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "provider_base_url" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "provider_credentials_enc" "bytea";--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "provider_cursor" bigint;--> statement-breakpoint
ALTER TABLE "email_send_attempts" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_account_agentic_team_only" CHECK ("email_accounts"."provider" <> 'agentic_inbox' OR "email_accounts"."kind" = 'team');--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_account_agentic_connected_requires_credentials" CHECK ("email_accounts"."provider" <> 'agentic_inbox' OR "email_accounts"."status" = 'disconnected' OR ("email_accounts"."provider_base_url" IS NOT NULL AND "email_accounts"."provider_credentials_enc" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_account_gmail_no_provider_fields" CHECK ("email_accounts"."provider" <> 'gmail' OR ("email_accounts"."provider_base_url" IS NULL AND "email_accounts"."provider_credentials_enc" IS NULL));