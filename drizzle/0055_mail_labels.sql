CREATE TABLE "mail_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"color" "label_color" NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_labels_key_unique" UNIQUE("key")
);
--> statement-breakpoint

-- Seed the three built-in mail labels (inbox parity U6). Their keys equal the historic follow-up
-- tokens already stored in email_threads.labels[], so existing labelled threads resolve to a
-- catalog entry with no data change and the existing inbox label filter keeps matching. Idempotent
-- (ON CONFLICT on the unique key) so it is safe on the test template and on the dev/prod DB.
INSERT INTO "mail_labels" ("key", "name", "color", "order")
VALUES ('important', 'Important', 'red', 0),
       ('to_do', 'To do', 'orange', 1),
       ('later', 'Later', 'blue', 2)
ON CONFLICT ("key") DO NOTHING;
