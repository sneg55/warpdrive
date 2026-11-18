import { eq, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { DedupMode } from "@/constants/importStatus";
import { IMPORTING_LEASE_MS } from "@/constants/importStatus";
import type { Db } from "@/db/client";
import { importBatches, importRows } from "@/db/schema";
import { type MappedRow, upgradeMappedRow } from "@/types/import";
import { err, ok, type Result } from "@/types/result";
import { narrowSource } from "./batchHelpers";
import { commitClaimedRow } from "./commitClaimed";
import type { Commit, ImportActor } from "./commitHelpers";
import type { ImportContext } from "./externalIds";
import { lockImportMutation } from "./importLock";
import { columnMappingSchema } from "./schemas";
import type { ImportTarget } from "./wizardState";

export type { ImportActor } from "./commitHelpers";

type ClaimedRow = { id: string; mapped: MappedRow };

export async function commitRow(
  db: Db,
  actor: ImportActor,
  rowId: string,
  target: ImportTarget,
  dedupMode: DedupMode,
  signal: AbortSignal,
): Promise<Result<Commit, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();

    const [owner] = await tx
      .select({
        batchId: importBatches.id,
        source: importBatches.source,
        columnMapping: importBatches.columnMapping,
      })
      .from(importRows)
      .innerJoin(importBatches, eq(importBatches.id, importRows.batchId))
      .where(eq(importRows.id, rowId));
    if (owner === undefined) {
      return err(new AppError(ERROR_IDS.IMPORT_ROW_GONE, "row gone", { rowId }));
    }
    const mapping = columnMappingSchema.safeParse(owner.columnMapping);
    const ctx: ImportContext = {
      source: narrowSource(owner.source),
      batchId: owner.batchId,
      createMissingStages: mapping.success && mapping.data.options.createMissingStages,
    };
    if (ctx.source === "pipedrive") await lockImportMutation(tx, signal);

    const lease = new Date(Date.now() - IMPORTING_LEASE_MS);
    const claimed = await tx.execute(sql`
      UPDATE import_rows SET status = 'importing', claimed_at = now()
      WHERE id = ${rowId}
        AND (status = 'valid' OR (status = 'importing' AND claimed_at < ${lease}))
      RETURNING id, mapped
    `);

    if (claimed.rows.length === 0) {
      const [existing] = await tx.select().from(importRows).where(sql`${importRows.id} = ${rowId}`);
      if (existing === undefined) {
        return err(new AppError(ERROR_IDS.IMPORT_ROW_GONE, "row gone", { rowId }));
      }
      return ok({
        status: existing.status,
        entityId: existing.createdEntityId,
        warnings: existing.warnings,
      });
    }

    const first = claimed.rows[0] as ClaimedRow | undefined;
    if (first === undefined) {
      return err(new AppError(ERROR_IDS.IMPORT_ROW_GONE, "claim returned no row", { rowId }));
    }
    const mapped = upgradeMappedRow(first.mapped);

    return commitClaimedRow(tx, actor, ctx, rowId, target, dedupMode, mapped, signal);
  });
}
