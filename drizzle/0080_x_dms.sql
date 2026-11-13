CREATE TYPE "public"."x_account_status" AS ENUM('connected', 'reconnect_required');--> statement-breakpoint
CREATE TYPE "public"."x_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TABLE "x_account_members" (
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "x_account_members_account_id_user_id_pk" PRIMARY KEY("account_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "x_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"x_user_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"refresh_token_enc" "bytea",
	"access_token_enc" "bytea",
	"access_token_expires_at" timestamp with time zone,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"status" "x_account_status" DEFAULT 'connected' NOT NULL,
	"overdue_after_hours" integer DEFAULT 24 NOT NULL,
	"connected_by_user_id" uuid,
	"last_sync_at" timestamp with time zone,
	"last_error_id" text,
	"conversations_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x_accounts_x_user_id_unique" UNIQUE("x_user_id")
);
--> statement-breakpoint
CREATE TABLE "x_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"x_conversation_id" text NOT NULL,
	"participant_x_user_id" text NOT NULL,
	"participant_username" text,
	"participant_name" text,
	"participant_avatar_url" text,
	"encrypted" boolean DEFAULT false NOT NULL,
	"newest_event_id" text,
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"team_read_at" timestamp with time zone,
	"team_read_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"x_unread" boolean DEFAULT false NOT NULL,
	"is_trusted" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x_conversations_account_conversation_uq" UNIQUE("account_id","x_conversation_id")
);
--> statement-breakpoint
CREATE TABLE "x_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"x_event_id" text NOT NULL,
	"direction" "x_message_direction" NOT NULL,
	"sender_x_user_id" text NOT NULL,
	"text" text NOT NULL,
	"has_media" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"sent_by_user_id" uuid,
	CONSTRAINT "x_messages_conversation_event_uq" UNIQUE("conversation_id","x_event_id")
);
--> statement-breakpoint
CREATE TABLE "x_oauth_intents" (
	"state" text PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"code_verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "x_account_members" ADD CONSTRAINT "x_account_members_account_id_x_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."x_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_account_members" ADD CONSTRAINT "x_account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_accounts" ADD CONSTRAINT "x_accounts_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_conversations" ADD CONSTRAINT "x_conversations_account_id_x_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."x_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_conversations" ADD CONSTRAINT "x_conversations_team_read_by_user_id_users_id_fk" FOREIGN KEY ("team_read_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_messages" ADD CONSTRAINT "x_messages_conversation_id_x_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."x_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_messages" ADD CONSTRAINT "x_messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_oauth_intents" ADD CONSTRAINT "x_oauth_intents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "x_conversations_account_last_message_idx" ON "x_conversations" USING btree ("account_id","last_message_at" DESC NULLS LAST);