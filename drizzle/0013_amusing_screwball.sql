CREATE TYPE "public"."email_account_status" AS ENUM('connected', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."email_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."email_send_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."email_tracking_event_type" AS ENUM('open', 'click');--> statement-breakpoint
CREATE TYPE "public"."email_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('uploading', 'ready');--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_address" "citext" NOT NULL,
	"refresh_token_enc" "bytea",
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"last_history_id" text,
	"watch_expires_at" timestamp with time zone,
	"status" "email_account_status" DEFAULT 'connected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "email_accounts_email_address_unique" UNIQUE("email_address")
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"direction" "email_message_direction" NOT NULL,
	"from_email" "citext" NOT NULL,
	"to_emails" jsonb DEFAULT '[]' NOT NULL,
	"cc_emails" jsonb DEFAULT '[]' NOT NULL,
	"subject" text,
	"snippet" text,
	"body_html" text,
	"body_text" text,
	"sent_at" timestamp with time zone,
	"tracking_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_msg_acct_gmail" UNIQUE("account_id","gmail_message_id")
);
--> statement-breakpoint
CREATE TABLE "email_send_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"message_id_header" text NOT NULL,
	"account_id" uuid NOT NULL,
	"thread_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "email_send_status" DEFAULT 'pending' NOT NULL,
	"claim_token" uuid,
	"claimed_at" timestamp with time zone,
	"send_started_at" timestamp with time zone,
	"gmail_message_id" text,
	"error_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "uq_attempt_acct_key" UNIQUE("account_id","idempotency_key"),
	CONSTRAINT "uq_attempt_msgid" UNIQUE("message_id_header")
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"subject" text,
	"deal_id" uuid,
	"person_id" uuid,
	"visibility" "email_visibility" DEFAULT 'private' NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_thread_acct_gmail" UNIQUE("account_id","gmail_thread_id"),
	CONSTRAINT "uq_thread_id_acct" UNIQUE("id","account_id")
);
--> statement-breakpoint
CREATE TABLE "email_tracking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"event_type" "email_tracking_event_type" NOT NULL,
	"recipient" "citext" NOT NULL,
	"target_url" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_tracking_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"send_attempt_id" uuid NOT NULL,
	"message_id" uuid,
	"recipient" "citext" NOT NULL,
	"kind" "email_tracking_event_type" NOT NULL,
	"target_url" text,
	"disabled" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_tracking_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body_html" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body_html" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "status" "file_status" DEFAULT 'uploading' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "fk_msg_thread_same_mailbox" FOREIGN KEY ("thread_id","account_id") REFERENCES "public"."email_threads"("id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_attempts" ADD CONSTRAINT "email_send_attempts_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_attempts" ADD CONSTRAINT "fk_attempt_thread_same_mailbox" FOREIGN KEY ("thread_id","account_id") REFERENCES "public"."email_threads"("id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD CONSTRAINT "email_tracking_events_token_id_email_tracking_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."email_tracking_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD CONSTRAINT "email_tracking_events_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tracking_tokens" ADD CONSTRAINT "email_tracking_tokens_send_attempt_id_email_send_attempts_id_fk" FOREIGN KEY ("send_attempt_id") REFERENCES "public"."email_send_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tracking_tokens" ADD CONSTRAINT "email_tracking_tokens_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ete_message_occurred_idx" ON "email_tracking_events" USING btree ("message_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ett_send_attempt_idx" ON "email_tracking_tokens" USING btree ("send_attempt_id");--> statement-breakpoint
CREATE INDEX "ett_message_idx" ON "email_tracking_tokens" USING btree ("message_id");