import { startAppBoss } from "@/jobs/appInstrumentation";
import { setBoss } from "@/jobs/boss";

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
    if (env.NODE_ENV === "development") {
      const { registerImportWorkers } = await import("@/features/import/registerImportWorkers");
      await registerImportWorkers(boss);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `FATAL: app pg-boss failed to start; background jobs would silently no-op: ${message}`,
    );
    throw e;
  }
}
