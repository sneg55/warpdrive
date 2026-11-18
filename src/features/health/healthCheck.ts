import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";

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
