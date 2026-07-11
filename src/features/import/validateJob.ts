import type { PgBoss } from "pg-boss";
import { IMPORT_JOB_TIMEOUT_MS, PGBOSS_QUEUE_IMPORT_VALIDATE } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { validateBatch } from "./batch";
import { enqueueBatchJob, registerBatchWorker, runBatchAsActor } from "./jobRunner";

// Validate the batch as its creator. validateBatch emits per-row progress and lands "ready";
// runBatchAsActor marks the batch "failed" on a throw so the wizard's wait resolves.
export async function handleValidateJob(
  db: Db,
  job: { data: { batchId: string } },
  signal: AbortSignal,
): Promise<void> {
  await runBatchAsActor(db, job.data.batchId, validateBatch, signal);
}

export async function enqueueValidateJob(batchId: string, signal: AbortSignal): Promise<void> {
  await enqueueBatchJob(PGBOSS_QUEUE_IMPORT_VALIDATE, batchId, signal);
}

export async function registerImportValidateWorker(boss: PgBoss): Promise<void> {
  await registerBatchWorker(boss, PGBOSS_QUEUE_IMPORT_VALIDATE, (job) =>
    handleValidateJob(prodDb, job, AbortSignal.timeout(IMPORT_JOB_TIMEOUT_MS)),
  );
}
