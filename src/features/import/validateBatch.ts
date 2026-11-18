import { and, eq, inArray } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { importBatches, importRows } from "@/db/schema";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { err, ok, type Result } from "@/types/result";
import { loadOwnedBatch, narrowSource, narrowTarget } from "./batchHelpers";
import type { ImportActor } from "./commit";
import { tallyRows } from "./finalize";
import { applyMapping, validateMappedRow } from "./mapRow";
import { publishImportProgress, shouldEmit } from "./progress";
import { columnMappingSchema, normalizeMapping } from "./schemas";

export async function validateBatch(
  db: Db,
  actor: ImportActor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<{ valid: number; invalid: number }, AppError>> {
  const owned = await loadOwnedBatch(db, actor, batchId, signal);
  if (owned.ok === false) return owned;
  const batch = owned.value;
  const target = narrowTarget(batch.targetEntity);
  const parsedMapping = columnMappingSchema.safeParse(batch.columnMapping);
  if (parsedMapping.success === false) {
    return err(new AppError(ERROR_IDS.IMPORT_MAPPING_MISSING, "mapping not set", { batchId }));
  }
  const mapping = normalizeMapping(batch.columnMapping, target);
  const source = narrowSource(batch.source);
  const defs = target === "note" ? [] : await listDefs(db, target, {}, signal);
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    const claim = await tx
      .update(importBatches)
      .set({ status: "validating" })
      .where(
        and(
          eq(importBatches.id, batchId),
          inArray(importBatches.status, ["pending", "mapping_ready", "validating"]),
        ),
      )
      .returning({ id: importBatches.id });
    if (claim.length === 0) {
      const counts = await tallyRows(tx, batchId);
      return ok({ valid: counts.valid, invalid: counts.invalid });
    }
    const rows = await tx
      .select()
      .from(importRows)
      .where(
        and(eq(importRows.batchId, batchId), inArray(importRows.status, ["pending", "invalid"])),
      );

    let processed = 0;
    let lastEmitted = 0;
    for (const row of rows) {
      signal.throwIfAborted();
      const mapped = applyMapping(row.raw, mapping, target, batch.headers ?? undefined);
      const r = validateMappedRow(target, mapped, defs, source);
      if (r.ok) {
        await tx
          .update(importRows)
          .set({ mapped: r.value, status: "valid", errors: [] })
          .where(eq(importRows.id, row.id));
      } else {
        await tx
          .update(importRows)
          .set({ mapped, status: "invalid", errors: r.errors })
          .where(eq(importRows.id, row.id));
      }
      processed += 1;
      if (shouldEmit(processed, rows.length, lastEmitted)) {
        await publishImportProgress(
          db,
          { batchId, phase: "validate", processed, total: rows.length, status: "validating" },
          signal,
        );
        lastEmitted = processed;
      }
    }

    const counts = await tallyRows(tx, batchId);
    await tx
      .update(importBatches)
      .set({ status: "ready", validRows: counts.valid, errorRows: counts.invalid })
      .where(eq(importBatches.id, batchId));
    return ok({ valid: counts.valid, invalid: counts.invalid });
  });
}
