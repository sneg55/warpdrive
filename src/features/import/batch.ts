import { and, eq, inArray } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { importBatches, importRows } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import { loadOwnedBatch, narrowSource, narrowTarget } from "./batchHelpers";
import { commitRow, type ImportActor } from "./commit";
import { finalizeBatch } from "./finalize";
import { publishImportProgress, shouldEmit } from "./progress";
import { type ColumnMappingInput, columnMappingSchema, mappingEntityErrors } from "./schemas";
import type { ImportTarget } from "./wizardState";

export { getBatch, listRows } from "./batchRead";
export { validateBatch } from "./validateBatch";

export type CreateBatchArgs = {
  targetEntity: ImportTarget;
  filename: string;
  rows: Record<string, string>[];
};

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

export async function setMapping(
  db: Db,
  actor: ImportActor,
  batchId: string,
  mapping: ColumnMappingInput,
  signal: AbortSignal,
): Promise<Result<{ batchId: string }, AppError>> {
  const owned = await loadOwnedBatch(db, actor, batchId, signal);
  if (owned.ok === false) return owned;
  const entityErrors = mappingEntityErrors(
    mapping,
    narrowTarget(owned.value.targetEntity),
    narrowSource(owned.value.source),
  );
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
  const parsedMapping = columnMappingSchema.safeParse(batch.columnMapping);
  if (parsedMapping.success === false) {
    return err(new AppError(ERROR_IDS.IMPORT_MAPPING_MISSING, "mapping not set", { batchId }));
  }
  const mapping = parsedMapping.data;

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
    .where(and(eq(importRows.batchId, batchId), eq(importRows.status, "valid")))
    .orderBy(importRows.rowNumber);

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
    await finalizeBatch(db, batchId);
  }
  return ok({ imported, skipped, invalid });
}
