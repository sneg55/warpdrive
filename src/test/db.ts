import { randomUUID } from "node:crypto";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { inject } from "vitest";
import * as schema from "@/db/schema";
import type { TestPgConnection } from "../../vitest.globalSetup";

// Per-test database via the shared container + migrated template set up in vitest.globalSetup.ts.
// makeTestDb() clones the template (CREATE DATABASE ... TEMPLATE, ~15ms) instead of starting a
// container and re-running every migration (~1.5s). Each test still gets its own real, isolated
// Postgres database (no mocking, per CLAUDE.md); the migrations already ran once on the template.

export interface TestDb {
  db: NodePgDatabase<typeof schema>;
  url: string;
  pool: Pool;
  close: () => Promise<void>;
}

function connectionUri(pg: TestPgConnection, database: string): string {
  const user = encodeURIComponent(pg.user);
  const password = encodeURIComponent(pg.password);
  return `postgres://${user}:${password}@${pg.host}:${pg.port}/${database}`;
}

// One admin pool per worker, connected to the container's default database, reused for the
// CREATE/DROP DATABASE DDL of every test in that worker (those cannot run while connected to the
// database being created or dropped).
let adminPool: Pool | null = null;
function getAdminPool(pg: TestPgConnection): Pool {
  if (adminPool === null) {
    adminPool = new Pool({
      host: pg.host,
      port: pg.port,
      user: pg.user,
      password: pg.password,
      database: pg.adminDatabase,
      max: 2,
    });
  }
  return adminPool;
}

// Clone a fresh database from the migrated template and return a drizzle handle to it.
export async function makeTestDb(): Promise<TestDb> {
  const pg = inject("testPg");
  const admin = getAdminPool(pg);
  const name = `t_${randomUUID().replace(/-/g, "")}`;

  await admin.query(`CREATE DATABASE "${name}" TEMPLATE ${pg.template}`);

  const url = connectionUri(pg, name);
  // Small per-test pool: many workers share one container, so keep the aggregate connection
  // count well under the container's max_connections.
  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema });

  return {
    db,
    url,
    pool,
    // close() only ends this test's pool; the cloned database itself is left for the disposable
    // container to reclaim on stop. Dropping it here would race a FORCE-drop against connections a
    // test opened on `url` (e.g. a LISTEN/NOTIFY client), surfacing a 57P01 on their error handler.
    // Cloned databases hold only the empty migrated schema, so hundreds cost negligibly.
    close: async () => {
      await pool.end();
    },
  };
}
