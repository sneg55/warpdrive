-- Custom SQL migration file, put your code below! --

-- Backfill from_name for rows synced before 0048, when from_email stored the whole From header
-- ("Scrape.do Team" <support@scrape.do>). Split those into a bare from_email + a from_name so the
-- inbox list, reader, sender-name search, and contact matching behave like post-0048 mail.
-- Only touches rows that still hold the angle-bracket header form and have no from_name yet.
UPDATE email_messages
SET
  from_name = NULLIF(btrim(btrim(substring(from_email FROM '^(.*)<')), '"'), ''),
  from_email = btrim(substring(from_email FROM '<([^>]*)>'))
WHERE from_email LIKE '%<%>%'
  AND from_name IS NULL;
