import { eq } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import type { Db } from "@/db/client";
import { importBatches } from "@/db/schema";
import { requireBoss } from "@/jobs/requireBoss";
import type { ImportActor } from "./commit";
import { loadImportActor } from "./importActor";

export async function enqueueBatchJob(
  queue: string,
  batchId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const boss = requireBoss();
  if (boss === null) return;
  await boss.createQueue(queue);
  await boss.send(queue, { batchId }, { singletonKey: batchId });
}

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
