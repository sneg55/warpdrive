import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { IMPORT_SOURCES, type ImportSource } from "@/constants/importSources";
import type { Db } from "@/db/client";
import { type ImportBatch, importBatches } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import type { ImportActor } from "./commit";
import { IMPORT_TARGETS } from "./importFields";
import type { ImportTarget } from "./wizardState";

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

export function narrowTarget(target: string): ImportTarget {
  if ((IMPORT_TARGETS as readonly string[]).includes(target)) return target as ImportTarget;
  throw new AppError(ERROR_IDS.DB_INVARIANT, "import batch has an unknown target", { target });
}

export function narrowSource(source: string): ImportSource {
  if ((IMPORT_SOURCES as readonly string[]).includes(source)) return source as ImportSource;
  throw new AppError(ERROR_IDS.DB_INVARIANT, "import batch has an unknown source", { source });
}
