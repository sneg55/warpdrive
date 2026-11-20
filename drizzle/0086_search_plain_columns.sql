ALTER TABLE "activities" ADD COLUMN "note_plain" text GENERATED ALWAYS AS (search_plain_text(note)) STORED;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "body_html_plain" text GENERATED ALWAYS AS (search_plain_text(body_html)) STORED;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "body_plain" text GENERATED ALWAYS AS (search_plain_text(body)) STORED;