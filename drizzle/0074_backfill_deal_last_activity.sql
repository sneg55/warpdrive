UPDATE "deals" d
SET "last_activity_at" = (
  SELECT max(coalesce(a."due_at", a."done_at"))
  FROM "activities" a
  WHERE a."deal_id" = d."id"
    AND a."done" = true
    AND a."deleted_at" IS NULL
);
