CREATE TABLE "lost_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
INSERT INTO "lost_reasons" ("name", "order") VALUES
	('Price too high', 0),
	('Lost to competitor', 1),
	('No budget', 2),
	('No decision', 3),
	('Bad timing', 4);
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lost_reason_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lost_reason_id_lost_reasons_id_fk" FOREIGN KEY ("lost_reason_id") REFERENCES "public"."lost_reasons"("id") ON DELETE no action ON UPDATE no action;