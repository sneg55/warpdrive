import type { PgBoss } from "pg-boss";
import { IMPORT_JOB_TIMEOUT_MS, PGBOSS_QUEUE_IMPORT_COMMIT } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { commitBatch } from "./batch";
import { enqueueBatchJob, registerBatchWorker, runBatchAsActor } from "./jobRunner";

export async function handleCommitJob(
  db: Db,
  job: { data: { batchId: string } },
  signal: AbortSignal,
): Promise<void> {
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
