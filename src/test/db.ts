import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { inject } from "vitest";
import * as schema from "@/db/schema";
import type { TestPgConnection } from "../../vitest.globalSetup";

const OBJECT_IN_USE = "55006";
const DROP_ATTEMPTS = 100;
const DROP_RETRY_MS = 100;

function isObjectInUse(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === OBJECT_IN_USE
  );
}

async function dropDatabase(admin: Pool, name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
      return;
    } catch (error) {
      if (!isObjectInUse(error)) throw error;
      if (attempt >= DROP_ATTEMPTS) {
        console.warn(`test database ${name} still in use after ${attempt} attempts, left behind`);
        return;
      }
      await sleep(DROP_RETRY_MS);
    }
  }
}

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

export async function makeTestDb(): Promise<TestDb> {
  const pg = inject("testPg");
  const admin = getAdminPool(pg);
  const name = `t_${randomUUID().replace(/-/g, "")}`;

  await admin.query(`CREATE DATABASE "${name}" TEMPLATE ${pg.template}`);

  const url = connectionUri(pg, name);
  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema });

  return {
    db,
    url,
    pool,
    close: async () => {
      await pool.end();
      await dropDatabase(admin, name);
    },
  };
}

export interface EmptyTestDb {
  db: NodePgDatabase<Record<string, never>>;
  url: string;
  name: string;
  pool: Pool;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}

export async function makeEmptyDb(): Promise<EmptyTestDb> {
  const pg = inject("testPg");
  const admin = getAdminPool(pg);
  const name = `t_${randomUUID().replace(/-/g, "")}`;

  await admin.query(`CREATE DATABASE "${name}"`);

  const url = connectionUri(pg, name);
  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool);

  return {
    db,
    url,
    name,
    pool,
    close: async () => {
      await pool.end();
    },
    drop: async () => {
      await dropDatabase(admin, name);
    },
  };
}
