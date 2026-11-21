import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, inject, test } from "vitest";
import { makeEmptyDb, makeTestDb } from "./db";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

test("harness gives a live Postgres with required extensions", async () => {
  const ext = await h.db.execute(
    sql`SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','citext') ORDER BY extname`,
  );
  const names = ext.rows.map((r) => (r as { extname: string }).extname);
  expect(names).toEqual(["citext", "pgcrypto"]);
});

test("empty db starts without public tables and drop removes the database", async () => {
  const pg = inject("testPg");
  const empty = await makeEmptyDb();
  const tables = await empty.db.execute(
    sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  expect((tables.rows[0] as { n: number }).n).toBe(0);
  await empty.close();
  await empty.drop();
  const admin = new Pool({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: pg.adminDatabase,
    max: 2,
  });
  const rows = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [empty.name]);
  expect(rows.rowCount).toBe(0);
  await admin.end();
});
