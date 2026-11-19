CREATE TABLE "intercom_search_backfill" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"cursor_deal_id" uuid,
	"completed_at" timestamp with time zone,
	CONSTRAINT "intercom_search_backfill_singleton" CHECK ("intercom_search_backfill"."id" = true)
);
