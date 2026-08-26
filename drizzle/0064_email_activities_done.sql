-- Emails logged through the composer's "Add as activity" were created open and undated, so they
-- sat in the dashboard's undated bucket permanently and never reached the completed count. The
-- composer now logs them done; this repairs the rows written before that.
UPDATE "activities"
SET "done" = true, "done_at" = "created_at"
WHERE "type_id" IN (SELECT "id" FROM "activity_types" WHERE "key" = 'email')
  AND "done" = false
  AND "due_at" IS NULL
  AND "deleted_at" IS NULL;
