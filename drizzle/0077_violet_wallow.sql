CREATE TABLE "email_oauth_intents" (
	"state" text PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"backfill_days" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_oauth_intents" ADD CONSTRAINT "email_oauth_intents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;