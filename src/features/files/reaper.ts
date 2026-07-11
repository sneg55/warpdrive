import { and, eq, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import { PGBOSS_QUEUE_FILE_REAPER } from "@/constants/jobNames";
import { db as defaultDb } from "@/db/client";
import type * as schema from "@/db/schema";
import { files } from "@/db/schema";
import { makeStorageClient, type StorageClient } from "./storage";

type Db = NodePgDatabase<typeof schema>;

// Rows older than one hour are stale: a presigned upload that never confirmed.
const DEFAULT_OLDER_THAN_MS = 3_600_000;
// Bound a single reaper run so a wedged storage call cannot hang the worker.
const REAPER_JOB_TIMEOUT_MS = 5 * 60 * 1000;

export interface ReapOptions {
  storage: StorageClient;
  olderThanMs?: number;
  signal: AbortSignal;
}

/**
 * Clear files rows stuck in status='uploading' past olderThanMs, plus their
 * MinIO objects. Crash-safe delete order: object FIRST, row SECOND. If the
 * process dies between the two, the worst case is a row whose object is already
 * gone, which the next run re-handles (deleteObject is idempotent); we never
 * leave an orphaned object with no row to find it. Per-item Result isolation:
 * one object's delete failure is a value, not a throw, so the row is left for
 * the next run and the rest of the batch proceeds.
 */
export async function reapStaleUploads(
  db: Db,
  { storage, olderThanMs = DEFAULT_OLDER_THAN_MS, signal }: ReapOptions,
): Promise<{ deleted: number }> {
  signal.throwIfAborted();
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db
    .select({ id: files.id, s3Key: files.s3Key })
    .from(files)
    .where(and(eq(files.status, "uploading"), lt(files.createdAt, cutoff)));
  signal.throwIfAborted();

  let deleted = 0;
  for (const row of stale) {
    const removed = await storage.deleteObject(row.s3Key, signal);
    signal.throwIfAborted();
    // Storage failure is a value: skip this row, leave it for the next run.
    if (!removed.ok) continue;
    await db.delete(files).where(eq(files.id, row.id));
    signal.throwIfAborted();
    deleted += 1;
  }
  return { deleted };
}

// Register the hourly reaper. NOT wired into startWorker here (that is Task 23);
// this only defines registration, mirroring registerEmailJobs.
export async function registerReaperJob(boss: PgBoss): Promise<void> {
  await boss.createQueue(PGBOSS_QUEUE_FILE_REAPER);
  await boss.work(PGBOSS_QUEUE_FILE_REAPER, async () => {
    await reapStaleUploads(defaultDb, {
      storage: makeStorageClient(),
      signal: AbortSignal.timeout(REAPER_JOB_TIMEOUT_MS),
    });
  });
  await boss.schedule(PGBOSS_QUEUE_FILE_REAPER, "0 * * * *");
}
