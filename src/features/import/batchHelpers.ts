import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type ImportBatch, importBatches } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import type { ImportActor } from "./commit";
import type { ImportTarget } from "./wizardState";

// Ownership-load a batch: a batch you do not own is indistinguishable from absent
// (404-on-invisible). Admins bypass the ownership check. The single authority for
// the IMPORT_BATCH_NOT_FOUND rule so every service entry point gates identically.
export async function loadOwnedBatch(
  db: Db,
  actor: ImportActor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<ImportBatch, AppError>> {
  signal.throwIfAborted();
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (batch === undefined || (batch.createdBy !== actor.id && actor.type !== "admin")) {
    return err(new AppError(ERROR_IDS.IMPORT_BATCH_NOT_FOUND, "batch not found", { batchId }));
  }
  return ok(batch);
}

const IMPORT_TARGETS = ["person", "organization", "deal", "lead", "activity"] as const;

// Narrow the table's text target_entity to a known ImportTarget. A stored value outside this
// set is a data invariant violation (nothing but the app itself writes this column).
export function narrowTarget(target: string): ImportTarget {
  if ((IMPORT_TARGETS as readonly string[]).includes(target)) return target as ImportTarget;
  throw new AppError(ERROR_IDS.DB_INVARIANT, "import batch has an unknown target", { target });
}
