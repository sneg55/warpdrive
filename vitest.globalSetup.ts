import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";
import { AppError, ERROR_IDS } from "./src/constants/errorIds";
import { ensureSearchIndexes } from "./src/db/searchIndexes";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("./drizzle", import.meta.url));
const MIGRATIONS_JOURNAL = fileURLToPath(new URL("./drizzle/meta/_journal.json", import.meta.url));

export const TEMPLATE_DB = "wd_template";

export interface TestPgConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  adminDatabase: string;
  template: string;
}

declare module "vitest" {
  interface ProvidedContext {
    testPg: TestPgConnection;
  }
}

export interface ExternalTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  adminDatabase: string;
}

export function externalTarget(): ExternalTarget | undefined {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) return undefined;
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port === "" ? 5432 : Number(parsed.port),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    adminDatabase: parsed.pathname.replace(/^\//, ""),
  };
}

let container: StartedPostgreSqlContainer | undefined;

async function containerTarget(): Promise<ExternalTarget> {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withCommand([
      "postgres",
      "-c",
      "max_connections=300",
      "-c",
      "fsync=off",
      "-c",
      "full_page_writes=off",
    ])
    .start();
  return {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    adminDatabase: container.getDatabase(),
  };
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const target = externalTarget() ?? (await containerTarget());
  const { adminDatabase, ...endpoint } = target;
  const adminPool = new Pool({ ...endpoint, database: adminDatabase, max: 2 });
  const existing = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    TEMPLATE_DB,
  ]);
  if (existing.rows.length === 0) {
    await adminPool.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  }
  await adminPool.end();

  const templatePool = new Pool({ ...endpoint, database: TEMPLATE_DB, max: 2 });
  const templateDb = drizzle(templatePool);
  await templateDb.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await templateDb.execute(sql`CREATE EXTENSION IF NOT EXISTS citext`);
  if (existsSync(MIGRATIONS_JOURNAL)) {
    await migrate(templateDb, { migrationsFolder: MIGRATIONS_FOLDER });
    const indexes = await ensureSearchIndexes(templateDb, new AbortController().signal);
    if (!indexes.ok)
      throw new AppError(ERROR_IDS.DB_INVARIANT, `ensureSearchIndexes failed: ${indexes.error}`);
  }
  await templatePool.end();

  project.provide("testPg", { ...endpoint, adminDatabase, template: TEMPLATE_DB });

  return async () => {
    await container?.stop();
  };
}
