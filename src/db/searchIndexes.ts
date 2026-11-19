import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { err, ok, type Result } from "@/types/result";
import { SEARCH_INDEXES, type SearchIndexDef } from "./searchIndexDefs";

type AnyDb = NodePgDatabase<Record<string, unknown>>;

function createStatement(idx: SearchIndexDef) {
  const where = idx.where === undefined ? "" : ` WHERE ${idx.where}`;
  return sql.raw(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idx.name} ON ${idx.table} USING gin (${idx.expression} gin_trgm_ops)${where}`,
  );
}

async function invalidIndexNames(db: AnyDb): Promise<Set<string>> {
  const names = SEARCH_INDEXES.map((i) => i.name);
  const r = await db.execute(
    sql`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE NOT i.indisvalid AND c.relname = ANY(${sql.raw(`ARRAY['${names.join("','")}']`)})`,
  );
  return new Set(r.rows.map((x) => (x as { relname: string }).relname));
}

export async function ensureSearchIndexes(
  db: AnyDb,
  signal: AbortSignal,
): Promise<Result<{ rebuilt: string[] }, string>> {
  try {
    signal.throwIfAborted();
    const invalid = await invalidIndexNames(db);
    const rebuilt: string[] = [];
    for (const idx of SEARCH_INDEXES) {
      signal.throwIfAborted();
      if (invalid.has(idx.name)) {
        await db.execute(sql.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${idx.name}`));
        rebuilt.push(idx.name);
      }
      await db.execute(createStatement(idx));
    }
    return ok({ rebuilt });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return err(e instanceof Error ? e.message : String(e));
  }
}
