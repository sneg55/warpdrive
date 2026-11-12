CREATE TABLE "intercom_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"role" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intercom_contacts_email_lowercase" CHECK ("intercom_contacts"."email" = lower(btrim("intercom_contacts"."email")))
);
--> statement-breakpoint
CREATE TABLE "intercom_conversation_contacts" (
	"conversation_id" text NOT NULL,
	"contact_id" text NOT NULL,
	CONSTRAINT "intercom_conversation_contacts_conversation_id_contact_id_pk" PRIMARY KEY("conversation_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "intercom_conversation_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"part_type" text NOT NULL,
	"author_type" text,
	"author_name" text,
	"body_html" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intercom_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"state" text NOT NULL,
	"snippet" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_part_at" timestamp with time zone NOT NULL,
	"message_count" integer NOT NULL,
	"last_replier_name" text,
	"last_replier_type" text
);
--> statement-breakpoint
CREATE TABLE "intercom_sync_state" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"cursor_updated_at" bigint NOT NULL,
	"stalled_runs" integer DEFAULT 0 NOT NULL,
	"resume_updated_after" bigint,
	"resume_starting_after" text,
	"resume_held" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intercom_sync_state_singleton" CHECK ("intercom_sync_state"."id" = true)
);
--> statement-breakpoint
ALTER TABLE "intercom_conversation_contacts" ADD CONSTRAINT "intercom_conversation_contacts_conversation_id_intercom_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."intercom_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercom_conversation_parts" ADD CONSTRAINT "intercom_conversation_parts_conversation_id_intercom_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."intercom_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intercom_contacts_email_idx" ON "intercom_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "intercom_conversation_contacts_contact_idx" ON "intercom_conversation_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "intercom_parts_conversation_idx" ON "intercom_conversation_parts" USING btree ("conversation_id","created_at");