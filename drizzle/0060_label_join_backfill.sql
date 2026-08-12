-- Label join backfill + catalog integrity.
--
-- Background: 0046 seeded the catalog and populated the join tables for deal/person/organization,
-- but skipped 'lead' (the enum value had just been added, and Postgres forbids using a new enum
-- value in the transaction that adds it). Since then no writer has inserted a join row at all, so
-- the join tables drifted empty while records kept accumulating names in their `labels` text[].
-- The visible symptom: a name applied to records that exists in no catalog row renders as a gray
-- chip, is absent from every picker and filter, and does not block deletion of its own label.
--
-- This migration makes the catalog complete and the links real. Idempotent throughout, so it is
-- safe on a fresh template (nothing to adopt, nothing to link) and on a live database.

-- 1. Collapse catalog names that differ only by case within one target, keeping the oldest row.
-- Records store the NAME and every resolver matches case-insensitively, so such rows are already
-- indistinguishable to the application; they only make name-to-id resolution ambiguous. The join
-- tables are empty of anything but 0046's rows, and those cascade, so nothing is orphaned here.
DELETE FROM "labels" a
USING "labels" b
WHERE a."target" = b."target"
  AND lower(a."name") = lower(b."name")
  AND (b."created_at", b."id") < (a."created_at", a."id");
--> statement-breakpoint

-- 2. One catalog row per (target, name), case-insensitive. This is what lets a writer resolve an
-- applied name to exactly one label, and what stops two spellings of the same label existing.
CREATE UNIQUE INDEX IF NOT EXISTS "labels_target_lower_name_idx"
  ON "labels" ("target", lower("name"));
--> statement-breakpoint

-- 3. Adopt applied names that have no catalog row, per target. Gray is the color the chip resolver
-- already falls back to for an unresolved name, so adoption does not change how anything looks;
-- it makes the label manageable in Settings and selectable in the filters. `order` continues after
-- the target's current maximum so adopted labels sort below the curated ones.
INSERT INTO "labels" ("target", "name", "color", "order")
SELECT
  s.target::"label_target",
  s.name,
  'gray'::"label_color",
  COALESCE((SELECT max(l."order") FROM "labels" l WHERE l."target" = s.target::"label_target"), -1)
    + row_number() OVER (PARTITION BY s.target ORDER BY s.name)
FROM (
  SELECT DISTINCT 'deal' AS target, applied AS name
  FROM "deals", unnest("deals"."labels") AS applied
  UNION
  SELECT DISTINCT 'person', applied FROM "persons", unnest("persons"."labels") AS applied
  UNION
  SELECT DISTINCT 'organization', applied FROM "organizations", unnest("organizations"."labels") AS applied
) AS s
WHERE NOT EXISTS (
  SELECT 1 FROM "labels" l
  WHERE l."target" = s.target::"label_target" AND lower(l."name") = lower(s.name)
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 4. Link every applied name to its catalog row. After step 3 the lookup cannot miss.
INSERT INTO "deal_labels" ("deal_id", "label_id")
SELECT d."id", l."id"
FROM "deals" d, unnest(d."labels") AS applied
JOIN "labels" l ON l."target" = 'deal' AND lower(l."name") = lower(applied)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "person_labels" ("person_id", "label_id")
SELECT p."id", l."id"
FROM "persons" p, unnest(p."labels") AS applied
JOIN "labels" l ON l."target" = 'person' AND lower(l."name") = lower(applied)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "org_labels" ("org_id", "label_id")
SELECT o."id", l."id"
FROM "organizations" o, unnest(o."labels") AS applied
JOIN "labels" l ON l."target" = 'organization' AND lower(l."name") = lower(applied)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 5. The lead target, gated. 'lead' was added to the label_target enum by migration 0045, and
-- Postgres refuses to PARSE a statement using an enum value added in the still-open transaction.
-- A from-scratch install applies 0045 and this file in one transaction, so the statements below
-- must not be parsed there. They are also pointless there: a brand-new database has no leads to
-- adopt names from or link. Gating on "does any lead actually carry a label" satisfies both, since
-- EXECUTE only parses its argument when the branch is taken. On an existing database 0045
-- committed in an earlier deploy, so the value is usable and the backfill runs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "leads" WHERE cardinality("labels") > 0) THEN
    EXECUTE $q$
      INSERT INTO "labels" ("target", "name", "color", "order")
      SELECT
        'lead'::"label_target",
        s.name,
        'gray'::"label_color",
        COALESCE((SELECT max(l."order") FROM "labels" l WHERE l."target" = 'lead'), -1)
          + row_number() OVER (ORDER BY s.name)
      FROM (
        SELECT DISTINCT applied AS name FROM "leads", unnest("leads"."labels") AS applied
      ) AS s
      WHERE NOT EXISTS (
        SELECT 1 FROM "labels" l
        WHERE l."target" = 'lead' AND lower(l."name") = lower(s.name)
      )
      ON CONFLICT DO NOTHING;
    $q$;

    EXECUTE $q$
      INSERT INTO "lead_labels" ("lead_id", "label_id")
      SELECT le."id", l."id"
      FROM "leads" le, unnest(le."labels") AS applied
      JOIN "labels" l ON l."target" = 'lead' AND lower(l."name") = lower(applied)
      ON CONFLICT DO NOTHING;
    $q$;
  END IF;
END $$;
