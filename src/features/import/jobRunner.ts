import { eq } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import type { Db } from "@/db/client";
import { importBatches } from "@/db/schema";
import { requireBoss } from "@/jobs/requireBoss";
import type { ImportActor } from "./commit";
import { loadImportActor } from "./importActor";

// Enqueue a { batchId } job on a queue, deduped by singletonKey. No-ops when no pg-boss is
// set (tests, scripts), mirroring scheduleReminder; in production requireBoss throws instead,
// because dropping the job there would strand the batch. Shared by all four import phases.
export async function enqueueBatchJob(
  queue: string,
  batchId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const boss = requireBoss();
  if (boss === null) return;
  // pg-boss v12 rejects send() to a queue that was never created. The consumer creates the queue
  // (registerBatchWorker), but the producer can run first (or the worker may not have booted yet),
  // in which case the job would be silently dropped and the batch would hang at "uploaded". Create
  // the queue here too (idempotent) so enqueue never depends on worker boot order.
  await boss.createQueue(queue);
  await boss.send(queue, { batchId }, { singletonKey: batchId });
}

// Register a worker that processes { batchId } jobs (pg-boss v12 hands the handler a job
// ARRAY; guard the empty case). `run` owns the db + timeout signal for the phase.
export async function registerBatchWorker(
  boss: PgBoss,
  queue: string,
  run: (job: Job<{ batchId: string }>) => Promise<void>,
): Promise<void> {
  await boss.createQueue(queue);
  await boss.work(queue, async ([job]: Job<{ batchId: string }>[]) => {
    if (job === undefined) return;
    await run(job);
  });
}

// Load the batch + rebuild its creator's actor, then run fn. If the creator can no longer be
// hydrated (deactivated after enqueue), mark the batch "failed" so the wizard's poll resolves
// rather than waiting forever. On a throw, optionally mark "failed" (a terminal status) then
// rethrow so pg-boss retries. Validate marks failed on throw; commit does NOT (commitBatch
// finalizes itself to completed/partial/failed from row states, which must not be clobbered).
export async function runBatchAsActor(
  db: Db,
  batchId: string,
  fn: (db: Db, actor: ImportActor, batchId: string, signal: AbortSignal) => Promise<unknown>,
  signal: AbortSignal,
  opts: { markFailedOnError?: boolean } = {},
): Promise<void> {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (batch === undefined) return;
  const actor = await loadImportActor(db, batch.createdBy, signal);
  if (actor === null) {
    await db.update(importBatches).set({ status: "failed" }).where(eq(importBatches.id, batch.id));
    return;
  }
  try {
    await fn(db, actor, batch.id, signal);
  } catch (e) {
    if (opts.markFailedOnError !== false) {
      await db
        .update(importBatches)
        .set({ status: "failed" })
        .where(eq(importBatches.id, batch.id));
    }
    throw e;
  }
}
