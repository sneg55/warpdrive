CREATE TYPE "public"."email_account_kind" AS ENUM('personal', 'team');--> statement-breakpoint
CREATE TYPE "public"."email_backfill_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "email_account_members" (
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "email_account_members_account_id_user_id_pk" PRIMARY KEY("account_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "email_accounts" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "kind" "email_account_kind" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "overdue_after_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "connected_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "backfill_days" integer;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "backfill_status" "email_backfill_status";--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "backfill_page_token" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "backfill_error_id" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "backfill_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "sent_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "last_inbound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "team_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "team_read_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD COLUMN "author_user_id" uuid;--> statement-breakpoint
ALTER TABLE "email_account_members" ADD CONSTRAINT "email_account_members_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_account_members" ADD CONSTRAINT "email_account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_team_read_by_user_id_users_id_fk" FOREIGN KEY ("team_read_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_account_owner_kind" CHECK (("email_accounts"."kind" = 'personal') = ("email_accounts"."user_id" IS NOT NULL));