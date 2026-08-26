-- 0068 rebuilt organizations.search_tsv by dropping the column, which drops every index on it.
-- drizzle-kit does not re-emit the index because its own snapshot still carries it, so recreate it
-- here; without this every organization search falls back to a sequential scan.
CREATE INDEX IF NOT EXISTS "org_search_idx" ON "organizations" USING gin ("search_tsv");
