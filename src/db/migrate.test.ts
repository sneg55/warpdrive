import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { makeEmptyDb } from "@/test/db";
import { applyMigrations } from "./migrate";

let h: Awaited<ReturnType<typeof makeEmptyDb>>;

beforeAll(async () => {
  h = await makeEmptyDb();
});
afterAll(async () => {
  await h.close();
  await h.drop();
});

test("applyMigrations brings an empty db to a usable schema", async () => {
  const result = await applyMigrations(h.db);
  expect(result.ok).toBe(true);
  const tables = await h.db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='users'`,
  );
  expect(tables.rows).toHaveLength(1);
});

test("applyMigrations builds the trigram search indexes", async () => {
  const r = await h.db.execute(sql`SELECT 1 FROM pg_indexes WHERE indexname = 'deals_title_trgm'`);
  expect(r.rows).toHaveLength(1);
});

test("applyMigrations honors an explicit migrations folder", async () => {
  const result = await applyMigrations(h.db, undefined, "/nonexistent/drizzle/folder");
  expect(result.ok).toBe(false);
});
