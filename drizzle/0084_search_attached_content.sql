CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION search_plain_text(input text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $fn$
DECLARE
  stripped text;
  decoded text;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;
  stripped := regexp_replace(input, '<(br|/p|/div|/li)[^>]*>', ' ', 'gi');
  stripped := regexp_replace(stripped, '<[^>]*>', '', 'g');
  IF position('&' IN stripped) = 0 THEN
    RETURN btrim(regexp_replace(stripped, '\s+', ' ', 'g'));
  END IF;
  SELECT string_agg(
    CASE
      WHEN tok.m[1] ~ '^&#[0-9]{1,7};$'
        AND substr(tok.m[1], 3, length(tok.m[1]) - 3)::int BETWEEN 1 AND 1114111
        AND substr(tok.m[1], 3, length(tok.m[1]) - 3)::int NOT BETWEEN 55296 AND 57343
        THEN chr(substr(tok.m[1], 3, length(tok.m[1]) - 3)::int)
      WHEN tok.m[1] ~ '^&#[xX][0-9a-fA-F]{1,6};$'
        AND ('x' || lpad(substr(tok.m[1], 4, length(tok.m[1]) - 4), 8, '0'))::bit(32)::int BETWEEN 1 AND 1114111
        AND ('x' || lpad(substr(tok.m[1], 4, length(tok.m[1]) - 4), 8, '0'))::bit(32)::int NOT BETWEEN 55296 AND 57343
        THEN chr(('x' || lpad(substr(tok.m[1], 4, length(tok.m[1]) - 4), 8, '0'))::bit(32)::int)
      WHEN lower(tok.m[1]) = '&amp;' THEN '&'
      WHEN lower(tok.m[1]) = '&lt;' THEN '<'
      WHEN lower(tok.m[1]) = '&gt;' THEN '>'
      WHEN lower(tok.m[1]) = '&quot;' THEN '"'
      WHEN lower(tok.m[1]) = '&apos;' THEN ''''
      WHEN lower(tok.m[1]) = '&nbsp;' THEN ' '
      ELSE tok.m[1]
    END,
    '' ORDER BY tok.ord)
  INTO decoded
  FROM regexp_matches(stripped, '(&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);|[^&]+|&)', 'g')
    WITH ORDINALITY AS tok(m, ord);
  RETURN btrim(regexp_replace(coalesce(decoded, ''), '\s+', ' ', 'g'));
END;
$fn$;--> statement-breakpoint
CREATE TABLE "deal_intercom_search" (
	"deal_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"contact_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"part_id" text NOT NULL,
	"plain_text" text NOT NULL,
	"matched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "deal_intercom_search_pk" PRIMARY KEY("deal_id","person_id","contact_id","conversation_id","part_id")
);
--> statement-breakpoint
ALTER TABLE "deal_intercom_search" ADD CONSTRAINT "deal_intercom_search_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_intercom_search" ADD CONSTRAINT "deal_intercom_search_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_intercom_search" ADD CONSTRAINT "deal_intercom_search_conversation_id_intercom_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."intercom_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_intercom_search_deal_idx" ON "deal_intercom_search" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deal_intercom_search_conversation_idx" ON "deal_intercom_search" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "deal_intercom_search_contact_idx" ON "deal_intercom_search" USING btree ("contact_id");