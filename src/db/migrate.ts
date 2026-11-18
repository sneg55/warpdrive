import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { err, ok, type Result } from "@/types/result";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function applyMigrations(
  db: NodePgDatabase<Record<string, unknown>>,
  signal?: AbortSignal,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<Result<{ applied: true }, string>> {
  try {
    signal?.throwIfAborted();
    await migrate(db, { migrationsFolder });
    signal?.throwIfAborted();
    return ok({ applied: true });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return err(e instanceof Error ? e.message : String(e));
  }
}

async function runMigrations(
  signal?: AbortSignal,
  migrationsFolder?: string,
): Promise<Result<{ applied: true }, string>> {
  const { db } = await import("./client");
  return applyMigrations(db, signal, migrationsFolder);
}

export async function runMigrationsCli(migrationsFolder?: string): Promise<void> {
  const { pool } = await import("./client");
  const result = await runMigrations(undefined, migrationsFolder);
  await pool.end();
  if (!result.ok) {
    console.error(`migration failed: ${result.error}`);
    process.exit(1);
  }
  console.warn("migrations applied");
  process.exit(0);
}
