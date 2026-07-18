CREATE TABLE "app_release_status" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"latest_tag" text,
	"release_url" text,
	"release_notes" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_release_status_singleton" CHECK ("app_release_status"."id" = true)
);
