import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";

// Liveness + DB-reachability probe for the container healthcheck. Runs the cheapest
// possible round-trip (SELECT 1) so "is the app truly up" answers on the database, not
// just "port 3000 accepts connections". Returns a Result rather than throwing: the route
// maps ok -> 200 and err -> 503, and a probe must never crash the process it guards.
export async function checkHealth(db: Db, signal?: AbortSignal): Promise<Result<true, string>> {
  try {
    signal?.throwIfAborted();
    await db.execute(sql`select 1`);
    signal?.throwIfAborted();
    return ok(true);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return err("aborted");
    return err(e instanceof Error ? e.message : String(e));
  }
}
