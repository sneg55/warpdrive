ALTER TABLE "persons" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "last_name" text;--> statement-breakpoint
UPDATE "persons" SET
  "first_name" = CASE WHEN position(' ' in btrim("name")) > 0
    THEN substring(btrim("name") from 1 for position(' ' in btrim("name")) - 1) ELSE btrim("name") END,
  "last_name" = CASE WHEN position(' ' in btrim("name")) > 0
    THEN NULLIF(btrim(substring(btrim("name") from position(' ' in btrim("name")) + 1)), '') ELSE NULL END;