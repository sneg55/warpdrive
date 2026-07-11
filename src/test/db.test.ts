import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { makeTestDb } from "./db";

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
