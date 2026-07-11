import { startAppBoss } from "@/jobs/appInstrumentation";
import { setBoss } from "@/jobs/boss";

// Next runs this once per server process at startup. Boot pg-boss for the app so producers
// (email send, activity reminders, import enqueues) see a live boss instead of the null singleton
// that makes every enqueue silently no-op. Only the nodejs runtime boots a boss; the edge runtime
// and build-time evaluation are no-ops. Handlers stay with the dedicated `worker` service.
//
// NEXT_RUNTIME is Next-injected framework metadata (not app config), and reading it here
// lets the edge runtime bail out BEFORE importing the node-only env module. This file is exempted
// from the process.env lint boundary for exactly that reason.
export async function register(): Promise<void> {
  const runtime = process.env.NEXT_RUNTIME;
  if (runtime !== "nodejs") return;

  const { PgBoss } = await import("pg-boss");
  const { env } = await import("@/config/env");
  try {
    const boss = await startAppBoss({
      createBoss: () => new PgBoss(env.DATABASE_URL),
      setBoss,
    });
    // In development there is no separate `worker` service running (`next dev` is the whole stack),
    // so import jobs would enqueue with no consumer and a CSV would hang at status "uploaded"
    // forever. Register the import workers IN THIS PROCESS for dev only. Production sets
    // NODE_ENV=production and runs the dedicated worker service, so this is skipped there and jobs
    // are never double-processed. (Only the import queues are booted here to avoid pulling Gmail
    // sync / reminder side effects into the dev web process.)
    if (env.NODE_ENV === "development") {
      const { registerImportWorkers } = await import("@/features/import/registerImportWorkers");
      await registerImportWorkers(boss);
    }
  } catch (e) {
    // A boot failure must be loud: if it were swallowed, the web process would come up with a null
    // boss and silently drop every backgrounded job (the exact gap this fix closes). Log a clear
    // FATAL line for the operator, then rethrow to fail the process start.
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `FATAL: app pg-boss failed to start; background jobs would silently no-op: ${message}`,
    );
    throw e;
  }
}
