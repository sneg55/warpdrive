import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { err, ok, type Result } from "@/types/result";

// Default location: <repo-root>/drizzle, resolved relative to this module (src/db/migrate.ts),
// not process.cwd(), so migrations are found regardless of where the process starts. Callers can
// override this: once esbuild bundles the entrypoint, import.meta.url points at the OUTPUT file,
// so the relative walk no longer lands on <root>/drizzle. The bundled entrypoint passes an
// explicit folder (resolved from the container WORKDIR) instead of relying on this default.
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

// Pure-ish: applies forward-only migrations against a supplied db. Returns a Result so a
// caller (the one-shot Compose step) can exit non-zero on failure instead of a raw throw.
// Takes an explicit db so the real-Postgres test can drive it without the app pool.
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
    if (e instanceof Error && e.name === "AbortError") throw e; // never swallow cancellation
    return err(e instanceof Error ? e.message : String(e));
  }
}

// Public interface (E4 Compose entrypoint / first-run bootstrap import this): apply against
// the app db. Lazy import keeps tests from constructing the app pool just by importing here.
export async function runMigrations(
  signal?: AbortSignal,
  migrationsFolder?: string,
): Promise<Result<{ applied: true }, string>> {
  const { db } = await import("./client");
  return applyMigrations(db, signal, migrationsFolder);
}

// Entrypoint for the one-shot Compose `migrate` service (E4): apply, then exit 0/1.
// Exported so the bundled entrypoint (src/entrypoints/migrate.ts) can invoke it after
// esbuild strips the argv-based self-start guard's filename match. The bundled entrypoint
// passes an explicit migrations folder (import.meta.url is unreliable post-bundle).
export async function runMigrationsCli(migrationsFolder?: string): Promise<void> {
  const { pool } = await import("./client");
  const result = await runMigrations(undefined, migrationsFolder);
  await pool.end();
  if (!result.ok) {
    console.error(`migration failed: ${result.error}`);
    process.exit(1);
  }
  // console.warn (not log): no-console lint rule allows warn/error only.
  console.warn("migrations applied");
  process.exit(0);
}
