import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { SEARCH_INDEXES } from "./searchIndexDefs";
import { ensureSearchIndexes } from "./searchIndexes";
import { withTestDb } from "./testing";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function validity(db: TestDb): Promise<Map<string, boolean>> {
  const r = await db.execute(
    sql`SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname LIKE '%\_trgm'`,
  );
  return new Map(
    r.rows.map((x) => {
      const row = x as { relname: string; indisvalid: boolean };
      return [row.relname, row.indisvalid];
    }),
  );
}

describe("ensureSearchIndexes", () => {
  it("leaves every listed trigram index present and valid on a migrated database", async () => {
    await withTestDb(async (db) => {
      const v = await validity(db);
      for (const idx of SEARCH_INDEXES) expect(v.get(idx.name)).toBe(true);
    });
  });

  it("is idempotent", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const first = await ensureSearchIndexes(db, signal);
      const second = await ensureSearchIndexes(db, signal);
      expect(first.ok).toBe(true);
      expect(second).toEqual({ ok: true, value: { rebuilt: [] } });
    });
  });

  it("rebuilds an index marked invalid", async () => {
    await withTestDb(async (db) => {
      await db.execute(
        sql`UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'deals_title_trgm'::regclass`,
      );
      expect((await validity(db)).get("deals_title_trgm")).toBe(false);
      const r = await ensureSearchIndexes(db, new AbortController().signal);
      expect(r).toEqual({ ok: true, value: { rebuilt: ["deals_title_trgm"] } });
      expect((await validity(db)).get("deals_title_trgm")).toBe(true);
    });
  });

  it("builds a missing index", async () => {
    await withTestDb(async (db) => {
      await db.execute(sql`DROP INDEX persons_name_trgm`);
      const r = await ensureSearchIndexes(db, new AbortController().signal);
      expect(r.ok).toBe(true);
      expect((await validity(db)).get("persons_name_trgm")).toBe(true);
    });
  });
});
