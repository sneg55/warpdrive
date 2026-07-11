import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import { UNDOABLE_IMPORT_STATUSES } from "@/constants/importStatus";
import type { Db } from "@/db/client";
import { type ImportBatch, importBatches, importRows } from "@/db/schema";
import { ok, type Result } from "@/types/result";
import { loadOwnedBatch } from "./batchHelpers";
import type { ImportActor } from "./commit";

export interface BatchResult {
  imported: number;
  skipped: number;
  invalid: number;
  total: number;
}

// Exact outcome split computed from row statuses (finalizeBatch conflates imported +
// skipped_duplicate into importedRows, so it cannot report the split on its own).
export async function getBatchResult(
  db: Db,
  actor: ImportActor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<BatchResult, AppError>> {
  const owned = await loadOwnedBatch(db, actor, batchId, signal);
  if (owned.ok === false) return owned;
  const rows = await db
    .select({ status: importRows.status, n: sql<number>`count(*)::int` })
    .from(importRows)
    .where(eq(importRows.batchId, batchId))
    .groupBy(importRows.status);
  let imported = 0;
  let skipped = 0;
  let invalid = 0;
  let total = 0;
  for (const r of rows) {
    total += r.n;
    if (r.status === "imported") imported += r.n;
    else if (r.status === "skipped_duplicate") skipped += r.n;
    else if (r.status === "invalid" || r.status === "failed") invalid += r.n;
  }
  return ok({ imported, skipped, invalid, total });
}

export type BatchSummary = Pick<
  ImportBatch,
  | "id"
  | "filename"
  | "targetEntity"
  | "status"
  | "totalRows"
  | "importedRows"
  | "errorRows"
  | "createdAt"
  | "undoneAt"
>;

// The actor's own import runs, newest first (history page). Scoped to createdBy so one
// user never sees another's imports.
export async function listBatches(
  db: Db,
  actor: ImportActor,
  signal: AbortSignal,
): Promise<Result<BatchSummary[], AppError>> {
  signal.throwIfAborted();
  const rows = await db
    .select({
      id: importBatches.id,
      filename: importBatches.filename,
      targetEntity: importBatches.targetEntity,
      status: importBatches.status,
      totalRows: importBatches.totalRows,
      importedRows: importBatches.importedRows,
      errorRows: importBatches.errorRows,
      createdAt: importBatches.createdAt,
      undoneAt: importBatches.undoneAt,
    })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.createdBy, actor.id),
        inArray(importBatches.status, [...UNDOABLE_IMPORT_STATUSES]),
      ),
    )
    .orderBy(desc(importBatches.createdAt))
    .limit(100);
  return ok(rows);
}
