import { sql } from "drizzle-orm";
import { Client, Pool } from "pg";
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

test("closing a test db drops its database so a run does not fill the disk", async () => {
  const pg = inject("testPg");
  const handle = await makeTestDb();
  const name = new URL(handle.url).pathname.slice(1);
  const admin = new Pool({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: pg.adminDatabase,
    max: 2,
  });
  const before = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [name]);
  expect(before.rowCount).toBe(1);
  await handle.close();
  const after = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [name]);
  expect(after.rowCount).toBe(0);
  await admin.end();
});

test("closing a test db waits for a lingering connection instead of killing it", async () => {
  const handle = await makeTestDb();
  const lingering = new Client({ connectionString: handle.url });
  const errors: Error[] = [];
  lingering.on("error", (e) => errors.push(e));
  await lingering.connect();
  const release = new Promise<void>((resolve) => {
    setTimeout(() => {
      void lingering.end().then(resolve);
    }, 300);
  });
  await handle.close();
  await release;
  expect(errors).toEqual([]);
  const pg = inject("testPg");
  const admin = new Pool({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: pg.adminDatabase,
    max: 2,
  });
  const name = new URL(handle.url).pathname.slice(1);
  const rows = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [name]);
  expect(rows.rowCount).toBe(0);
  await admin.end();
});
