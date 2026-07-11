import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type ImportBatch, importBatches, importRows } from "@/db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Count valid vs invalid rows for the post-validate batch tally.
export async function tallyRows(
  tx: Tx,
  batchId: string,
): Promise<{ valid: number; invalid: number }> {
  const rows = await tx
    .select({ status: importRows.status })
    .from(importRows)
    .where(eq(importRows.batchId, batchId));
  let valid = 0;
  let invalid = 0;
  for (const r of rows) {
    if (r.status === "valid") valid += 1;
    else if (r.status === "invalid" || r.status === "failed") invalid += 1;
  }
  return { valid, invalid };
}

// Recompute committed counts and set the batch terminal status from row outcomes:
// completed (all good), partial (some imported, some not), failed (nothing imported).
export async function finalizeBatch(db: Db, batchId: string): Promise<void> {
  const rows = await db
    .select({ status: importRows.status })
    .from(importRows)
    .where(eq(importRows.batchId, batchId));
  let importedRows = 0;
  let errorRows = 0;
  let unresolved = 0;
  for (const r of rows) {
    if (r.status === "imported" || r.status === "skipped_duplicate") importedRows += 1;
    else if (r.status === "invalid" || r.status === "failed") errorRows += 1;
    else unresolved += 1;
  }
  const cleanCommit = errorRows === 0 && unresolved === 0;
  let status: ImportBatch["status"];
  if (importedRows > 0 && cleanCommit) status = "completed";
  else if (importedRows > 0) status = "partial";
  else if (rows.length > 0) status = "failed";
  else status = "completed";
  await db
    .update(importBatches)
    .set({ status, importedRows, errorRows })
    .where(eq(importBatches.id, batchId));
}
