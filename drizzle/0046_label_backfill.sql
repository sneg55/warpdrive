-- Label-catalog backfill: seed the historical Hot/Warm/Cold labels per target and populate the
-- join tables from the existing `labels text[]` columns. Idempotent (guards + ON CONFLICT), so it
-- is safe on an empty test template (seeds catalog only) and on the dev/prod DB (seeds + backfills).

-- 1. Seed catalog labels per target if absent. Color map: hot->red, warm->orange, cold->blue.
-- NOTE: the 'lead' target is intentionally excluded here. Postgres forbids using an enum value in
-- the same transaction it was added (migration 0045 added 'lead'), and the test template applies
-- all migrations in one transaction. Lead catalog labels are seeded by the demo seed / created by
-- users in settings / created by tests.
INSERT INTO "labels" ("target", "name", "color", "order")
SELECT t.target::"label_target", m.name, m.color::"label_color", m.ord
FROM (VALUES ('deal'), ('person'), ('organization')) AS t(target)
CROSS JOIN (VALUES ('Hot', 'red', 0), ('Warm', 'orange', 1), ('Cold', 'blue', 2)) AS m(name, color, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM "labels" l
  WHERE l."target" = t.target::"label_target" AND l."name" = m.name
);
--> statement-breakpoint

-- 2a. Backfill deal_labels from deals.labels[].
INSERT INTO "deal_labels" ("deal_id", "label_id")
SELECT d."id", l."id"
FROM "deals" d
CROSS JOIN LATERAL unnest(d."labels") AS key
JOIN "labels" l ON l."target" = 'deal'
  AND l."name" = CASE key WHEN 'hot' THEN 'Hot' WHEN 'warm' THEN 'Warm' WHEN 'cold' THEN 'Cold' END
WHERE key IN ('hot', 'warm', 'cold')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- (lead_labels backfill is intentionally omitted: see the note above about the 'lead' enum value
-- not being usable in this migration transaction. Legacy lead text[] labels, if any, are not
-- auto-migrated; lead labels are managed via the catalog going forward.)

-- 2c. Backfill person_labels from persons.labels[].
INSERT INTO "person_labels" ("person_id", "label_id")
SELECT p."id", l."id"
FROM "persons" p
CROSS JOIN LATERAL unnest(p."labels") AS key
JOIN "labels" l ON l."target" = 'person'
  AND l."name" = CASE key WHEN 'hot' THEN 'Hot' WHEN 'warm' THEN 'Warm' WHEN 'cold' THEN 'Cold' END
WHERE key IN ('hot', 'warm', 'cold')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 2d. Backfill org_labels from organizations.labels[].
INSERT INTO "org_labels" ("org_id", "label_id")
SELECT o."id", l."id"
FROM "organizations" o
CROSS JOIN LATERAL unnest(o."labels") AS key
JOIN "labels" l ON l."target" = 'organization'
  AND l."name" = CASE key WHEN 'hot' THEN 'Hot' WHEN 'warm' THEN 'Warm' WHEN 'cold' THEN 'Cold' END
WHERE key IN ('hot', 'warm', 'cold')
ON CONFLICT DO NOTHING;
