import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { applyMigrations } from "./migrate";

let container: StartedPostgreSqlContainer;
let pool: Pool;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
});
afterAll(async () => {
  await pool.end();
  await container.stop();
});

test("applyMigrations brings an empty db to a usable schema", async () => {
  const db = drizzle(pool);
  // pgcrypto/citext come from the first migration itself, not pre-seeded here.
  const result = await applyMigrations(db);
  expect(result.ok).toBe(true);
  const tables = await db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='users'`,
  );
  expect(tables.rows).toHaveLength(1);
});

test("applyMigrations honors an explicit migrations folder", async () => {
  // The bundled entrypoint passes the folder explicitly (import.meta.url is unreliable once
  // esbuild moves the code), so a bogus folder must actually be used and surface as an error.
  const db = drizzle(pool);
  const result = await applyMigrations(db, undefined, "/nonexistent/drizzle/folder");
  expect(result.ok).toBe(false);
});
