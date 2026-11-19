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

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
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

  const adminDatabase = container.getDatabase();
  const base = {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
  };

  const adminPool = new Pool({ ...base, database: adminDatabase, max: 2 });
  await adminPool.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  await adminPool.end();

  const templatePool = new Pool({ ...base, database: TEMPLATE_DB, max: 2 });
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

  project.provide("testPg", { ...base, adminDatabase, template: TEMPLATE_DB });

  return async () => {
    await container?.stop();
  };
}
