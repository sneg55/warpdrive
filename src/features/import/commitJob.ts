import type { PgBoss } from "pg-boss";
import { IMPORT_JOB_TIMEOUT_MS, PGBOSS_QUEUE_IMPORT_COMMIT } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { commitBatch } from "./batch";
import { enqueueBatchJob, registerBatchWorker, runBatchAsActor } from "./jobRunner";

// Commit the batch as its creator. commitBatch emits per-row progress, creates entities via
// the per-target authorities, and lands completed/partial/failed; runBatchAsActor marks the
// batch "failed" on a throw so the commit step's poll resolves.
export async function handleCommitJob(
  db: Db,
  job: { data: { batchId: string } },
  signal: AbortSignal,
): Promise<void> {
  // markFailedOnError: false because commitBatch finalizes the batch (completed/partial/
  // failed) from actual row states even on a mid-loop throw; a blanket "failed" would erase
  // a partial commit and wrongly block undo of the records it already created.
  await runBatchAsActor(db, job.data.batchId, commitBatch, signal, { markFailedOnError: false });
}

export async function enqueueCommitJob(batchId: string, signal: AbortSignal): Promise<void> {
  await enqueueBatchJob(PGBOSS_QUEUE_IMPORT_COMMIT, batchId, signal);
}

export async function registerImportCommitWorker(boss: PgBoss): Promise<void> {
  await registerBatchWorker(boss, PGBOSS_QUEUE_IMPORT_COMMIT, (job) =>
    handleCommitJob(prodDb, job, AbortSignal.timeout(IMPORT_JOB_TIMEOUT_MS)),
  );
}
