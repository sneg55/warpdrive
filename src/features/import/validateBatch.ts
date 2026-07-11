import { and, eq, inArray } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { importBatches, importRows } from "@/db/schema";
import { listDefs } from "@/features/custom-fields/defsRepo";
import type { CustomFieldDef } from "@/types/customFields";
import { err, ok, type Result } from "@/types/result";
import { loadOwnedBatch, narrowTarget } from "./batchHelpers";
import type { ImportActor } from "./commit";
import { tallyRows } from "./finalize";
import { applyMapping, validateMappedRow } from "./mapRow";
import { publishImportProgress, shouldEmit } from "./progress";
import { columnMappingSchema, normalizeMapping } from "./schemas";
import type { ImportTarget } from "./wizardState";

// listDefs only knows about CUSTOM_FIELD_TARGETS ("deal" | "person" | "organization" |
// "activity"); leads have no custom-field support at all, so skip the lookup entirely rather
// than widen listDefs's own type for a target it structurally cannot serve.
async function defsForTarget(
  db: Db,
  target: ImportTarget,
  signal: AbortSignal,
): Promise<CustomFieldDef[]> {
  if (target === "lead") return [];
  return listDefs(db, target, {}, signal);
}

// Validate every still-pending/invalid row against the mapping + custom-field defs.
// Row updates + batch update + counts all in one transaction; batch lands "ready".
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
  // safeParse: the columnMapping DB default is {} (schema requires `columns`), so a
  // validate before setMapping is a caller bad-state, not a server fault. Result, not throw.
  const parsedMapping = columnMappingSchema.safeParse(batch.columnMapping);
  if (parsedMapping.success === false) {
    return err(new AppError(ERROR_IDS.IMPORT_MAPPING_MISSING, "mapping not set", { batchId }));
  }
  // normalizeMapping (not the raw parse) so a batch mapped before cross-entity mapping existed,
  // whose columns carry no `entity`, still resolves to the same destinations.
  const mapping = normalizeMapping(batch.columnMapping, target);
  const defs = await defsForTarget(db, target, signal);
  signal.throwIfAborted();

  // Fold the "validating" flip, row updates, and final "ready" flip into one tx so a
  // mid-validate failure rolls back cleanly with no batch stranded in "validating".
  return db.transaction(async (tx) => {
    // Atomically claim: validate may start only from a pre-validate state (pending is the
    // legacy createBatch state, mapping_ready the storage flow) or resume a crashed
    // "validating". A stale validate retry that fires after commit/terminal/undo claims
    // nothing and no-ops, so it can never regress a committed batch back to "ready".
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
      // batch.headers (the CSV column order the prepare step stored) keeps a row-note's unmapped
      // lines in column order; row.raw's own key order is unreliable once round-tripped through
      // JSONB. Falls back to raw order for legacy batches with no stored headers.
      const mapped = applyMapping(row.raw, mapping, target, batch.headers ?? undefined);
      const r = validateMappedRow(target, mapped, defs);
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
        // Publish on `db` (the pool), NOT `tx`: a pg_notify issued inside this long
        // transaction would be buffered until commit, so the progress bar would sit at 0
        // for the whole validate phase and then jump. The pool connection fires it live.
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
