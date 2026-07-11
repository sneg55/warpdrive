import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { IMPORT_JOB_TIMEOUT_MS, PGBOSS_QUEUE_IMPORT_PREPARE } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { importBatches, importRows } from "@/db/schema";
import { makeStorageClient, type StorageClient } from "@/features/files/storage";
import { parseCsv } from "./csvParse";
import { registerBatchWorker } from "./jobRunner";
import { publishImportProgress } from "./progress";

const PREVIEW_ROW_COUNT = 20;

interface PrepareJob {
  data: { batchId: string };
}

// Download the uploaded CSV, parse it server-side, insert one import_rows row per source
// row, and store headers + a small preview for the map step. Lands the batch mapping_ready.
export async function handlePrepareJob(
  db: Db,
  deps: { storage: StorageClient },
  job: PrepareJob,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, job.data.batchId));
  if (batch === undefined || batch.s3Key === null) return;
  // Idempotency: parse only a batch that has not finished preparing. "uploaded" is the fresh
  // case; "parsing" is a prior attempt that crashed part-way, which a pg-boss retry must be
  // able to resume. A batch already at "mapping_ready" (or later) no-ops. The row insert below
  // is onConflictDoNothing, so resuming a half-inserted "parsing" batch never double-inserts.
  if (batch.status !== "uploaded" && batch.status !== "parsing") return;

  await db.update(importBatches).set({ status: "parsing" }).where(eq(importBatches.id, batch.id));
  try {
    const bytes = await deps.storage.getObjectBytes(batch.s3Key, signal);
    if (!bytes.ok) {
      await db
        .update(importBatches)
        .set({ status: "failed" })
        .where(eq(importBatches.id, batch.id));
      return;
    }
    signal.throwIfAborted();

    const { headers, rows } = parseCsv(bytes.value.toString("utf8"));
    if (rows.length > 0) {
      await db
        .insert(importRows)
        .values(
          rows.map((raw, i) => ({
            batchId: batch.id,
            rowNumber: i + 1,
            raw,
            status: "pending" as const,
          })),
        )
        // Idempotent on the UNIQUE(batch_id, row_number) index: a resumed "parsing" retry
        // re-inserts the same rows without failing on a partial prior insert.
        .onConflictDoNothing();
    }
    signal.throwIfAborted();

    await db
      .update(importBatches)
      .set({
        status: "mapping_ready",
        headers,
        previewRows: rows.slice(0, PREVIEW_ROW_COUNT),
        totalRows: rows.length,
        processedRows: rows.length,
      })
      .where(eq(importBatches.id, batch.id));

    await publishImportProgress(
      db,
      {
        batchId: batch.id,
        phase: "prepare",
        processed: rows.length,
        total: rows.length,
        status: "mapping_ready",
      },
      signal,
    );
  } catch (e) {
    // A parse/insert throw (or abort) must land the batch in a terminal state so the wizard's
    // prepare wait resolves; rethrow so pg-boss applies retry/backoff.
    await db.update(importBatches).set({ status: "failed" }).where(eq(importBatches.id, batch.id));
    throw e;
  }
}

export async function registerImportPrepareWorker(boss: PgBoss): Promise<void> {
  await registerBatchWorker(boss, PGBOSS_QUEUE_IMPORT_PREPARE, (job) =>
    handlePrepareJob(
      prodDb,
      { storage: makeStorageClient() },
      job,
      AbortSignal.timeout(IMPORT_JOB_TIMEOUT_MS),
    ),
  );
}
