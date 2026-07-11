import { and, eq, inArray } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type ImportBatch, type ImportRow, importBatches, importRows } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import { loadOwnedBatch, narrowTarget } from "./batchHelpers";
import { commitRow, type ImportActor } from "./commit";
import { finalizeBatch } from "./finalize";
import { publishImportProgress, shouldEmit } from "./progress";
import { type ColumnMappingInput, columnMappingSchema, mappingEntityErrors } from "./schemas";
import type { ImportTarget } from "./wizardState";

// validateBatch lives in its own module (batch.ts hit the file-size cap) but stays part of this
// module's public surface: validateJob and the wizard pipeline import it from here.
export { validateBatch } from "./validateBatch";

export type CreateBatchArgs = {
  targetEntity: ImportTarget;
  filename: string;
  rows: Record<string, string>[];
};

// Create one batch + one row per CSV row in a single transaction (status pending).
export async function createBatch(
  db: Db,
  actor: ImportActor,
  args: CreateBatchArgs,
  signal: AbortSignal,
): Promise<Result<{ batchId: string }, AppError>> {
  signal.throwIfAborted();
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        targetEntity: args.targetEntity,
        filename: args.filename,
        status: "pending",
        totalRows: args.rows.length,
        createdBy: actor.id,
      })
      .returning({ id: importBatches.id });
    if (batch === undefined) {
      // Programmer-unreachable: INSERT RETURNING with no row. Surface as a Result
      // so callers never see an opaque throw.
      return ok({ batchId: "" });
    }
    if (args.rows.length > 0) {
      await tx.insert(importRows).values(
        args.rows.map((raw, i) => ({
          batchId: batch.id,
          rowNumber: i + 1,
          raw,
          status: "pending" as const,
        })),
      );
    }
    return ok({ batchId: batch.id });
  });
}

// Persist the column mapping. Status stays pending. Ownership-gated.
export async function setMapping(
  db: Db,
  actor: ImportActor,
  batchId: string,
  mapping: ColumnMappingInput,
  signal: AbortSignal,
): Promise<Result<{ batchId: string }, AppError>> {
  const owned = await loadOwnedBatch(db, actor, batchId, signal);
  if (owned.ok === false) return owned;
  // The mapping is client-supplied. Reject columns aimed at an entity this target cannot write
  // before it is ever persisted, or commit would create related records nothing links to.
  const entityErrors = mappingEntityErrors(mapping, narrowTarget(owned.value.targetEntity));
  if (entityErrors.length > 0) {
    return err(
      new AppError(ERROR_IDS.IMPORT_MAPPING_ENTITY_INVALID, entityErrors[0] ?? "invalid mapping", {
        batchId,
        errors: entityErrors,
      }),
    );
  }
  await db
    .update(importBatches)
    .set({ columnMapping: mapping })
    .where(eq(importBatches.id, batchId));
  return ok({ batchId });
}

// Commit every "valid" row via commitRow (each in its own tx for retry safety).
// No outer transaction wraps the loop: row commits must land independently.
export async function commitBatch(
  db: Db,
  actor: ImportActor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<{ imported: number; skipped: number; invalid: number }, AppError>> {
  const owned = await loadOwnedBatch(db, actor, batchId, signal);
  if (owned.ok === false) return owned;
  const batch = owned.value;
  const target = narrowTarget(batch.targetEntity);
  // safeParse for the same reason as validateBatch: commit before setMapping is a
  // caller bad-state. Return a Result rather than throwing an uncaught ZodError.
  const parsedMapping = columnMappingSchema.safeParse(batch.columnMapping);
  if (parsedMapping.success === false) {
    return err(new AppError(ERROR_IDS.IMPORT_MAPPING_MISSING, "mapping not set", { batchId }));
  }
  const mapping = parsedMapping.data;

  // Atomically claim the commit. "ready" is the fresh start; "importing" is a prior attempt
  // that crashed before finalizing, which a pg-boss retry must be able to RESUME (commitRow is
  // per-row idempotent, and singletonKey serializes commit jobs, so no concurrent double-run).
  // A retry that fires after the batch already finalized (completed/partial/failed) or was
  // undone/undoing finds none of those states, claims nothing, and no-ops, so a retry never
  // re-creates records undo deleted nor overwrites a terminal status.
  const claim = await db
    .update(importBatches)
    .set({ status: "importing" })
    .where(
      and(eq(importBatches.id, batchId), inArray(importBatches.status, ["ready", "importing"])),
    )
    .returning({ id: importBatches.id });
  if (claim.length === 0) return ok({ imported: 0, skipped: 0, invalid: 0 });

  const rows = await db
    .select({ id: importRows.id })
    .from(importRows)
    .where(and(eq(importRows.batchId, batchId), eq(importRows.status, "valid")));

  let imported = 0;
  let skipped = 0;
  let invalid = 0;
  let processed = 0;
  let lastEmitted = 0;
  try {
    for (const row of rows) {
      signal.throwIfAborted();
      const r = await commitRow(db, actor, row.id, target, mapping.dedupMode, signal);
      if (r.ok === false) {
        invalid += 1;
      } else if (r.value.status === "imported") {
        imported += 1;
      } else if (r.value.status === "skipped_duplicate") {
        skipped += 1;
      } else {
        invalid += 1;
      }
      processed += 1;
      // Publish on db (not a tx): each commitRow already committed in its own tx, so a
      // progress notify here has nothing to roll back.
      if (shouldEmit(processed, rows.length, lastEmitted)) {
        await publishImportProgress(
          db,
          { batchId, phase: "commit", processed, total: rows.length, status: "importing" },
          signal,
        );
        lastEmitted = processed;
      }
    }
  } finally {
    // Finalize even on a mid-commit throw/abort (e.g. IMPORT_JOB_TIMEOUT_MS) so the batch
    // reaches a terminal status (partial when some rows imported, failed when none) instead
    // of stranding at "importing" and looping the wizard poll forever. undo then works on the
    // partial. The commit job does not blanket-mark "failed" for this reason.
    await finalizeBatch(db, batchId);
  }
  return ok({ imported, skipped, invalid });
}

// Read a single batch (ownership-gated) for the router.
export async function getBatch(
  db: Db,
  actor: ImportActor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<ImportBatch, AppError>> {
  return loadOwnedBatch(db, actor, batchId, signal);
}

// List a batch's rows (ownership-gated) for the router.
export async function listRows(
  db: Db,
  actor: ImportActor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<ImportRow[], AppError>> {
  const owned = await loadOwnedBatch(db, actor, batchId, signal);
  if (owned.ok === false) return owned;
  const rows = await db
    .select()
    .from(importRows)
    .where(eq(importRows.batchId, batchId))
    .orderBy(importRows.rowNumber);
  return ok(rows);
}
