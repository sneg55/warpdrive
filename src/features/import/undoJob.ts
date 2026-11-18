import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { AppError } from "@/constants/errorIds";
import { IMPORT_JOB_TIMEOUT_MS, PGBOSS_QUEUE_IMPORT_UNDO } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { importBatches, importRows } from "@/db/schema";
import { ok, type Result } from "@/types/result";
import { narrowSource, narrowTarget } from "./batchHelpers";
import type { ImportActor } from "./commit";
import type { ImportContext } from "./externalIds";
import { loadImportActor } from "./importActor";
import { enqueueBatchJob, registerBatchWorker } from "./jobRunner";
import { publishImportProgress, shouldEmit } from "./progress";
import { type SideRemoval, undoOneRow } from "./undoDelete";

interface UndoJob {
  data: { batchId: string };
}

export async function undoBatch(
  db: Db,
  actor: ImportActor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<{ deleted: number }, AppError>> {
  const [batchRow] = await db
    .select({
      t: importBatches.targetEntity,
      status: importBatches.status,
      source: importBatches.source,
    })
    .from(importBatches)
    .where(eq(importBatches.id, batchId));
  const target = narrowTarget(batchRow?.t ?? "person");
  const ctx: ImportContext = {
    source: narrowSource(batchRow?.source ?? "csv"),
    batchId,
    createMissingStages: false,
  };
  const priorStatus = batchRow?.status ?? "completed";
  const claim = await db
    .update(importBatches)
    .set({ status: "undoing" })
    .where(
      and(
        eq(importBatches.id, batchId),
        inArray(importBatches.status, ["completed", "partial", "undoing"]),
      ),
    )
    .returning({ id: importBatches.id });
  if (claim.length === 0) return ok({ deleted: 0 });
  const rows = await db
    .select({
      id: importRows.createdEntityId,
      orgId: importRows.createdOrgId,
      personId: importRows.createdPersonId,
      noteId: importRows.createdNoteId,
    })
    .from(importRows)
    .where(
      and(
        eq(importRows.batchId, batchId),
        eq(importRows.status, "imported"),
        or(
          isNotNull(importRows.createdEntityId),
          isNotNull(importRows.createdOrgId),
          isNotNull(importRows.createdPersonId),
          isNotNull(importRows.createdNoteId),
        ),
      ),
    );
  const primaryCount = rows.filter((r) => r.id !== null).length;

  let processed = 0;
  let deleted = 0;
  const side: SideRemoval = { attempted: 0, removed: 0 };
  let lastEmitted = 0;
  for (const row of rows) {
    signal.throwIfAborted();
    if (await undoOneRow(db, actor, target, row, side, ctx, signal)) deleted += 1;
    processed += 1;
    if (shouldEmit(processed, rows.length, lastEmitted)) {
      await publishImportProgress(
        db,
        { batchId, phase: "undo", processed, total: rows.length, status: "undoing" },
        signal,
      );
      lastEmitted = processed;
    }
  }

  const fullyUndone = deleted === primaryCount && side.removed === side.attempted;
  const finalStatus = fullyUndone ? "undone" : priorStatus;
  await db
    .update(importBatches)
    .set({ status: finalStatus, undoneAt: fullyUndone ? new Date() : null })
    .where(eq(importBatches.id, batchId));
  await publishImportProgress(
    db,
    { batchId, phase: "undo", processed: rows.length, total: rows.length, status: finalStatus },
    signal,
  );
  return ok({ deleted });
}

export async function handleUndoJob(db: Db, job: UndoJob, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, job.data.batchId));
  if (batch === undefined) return;
  const actor = await loadImportActor(db, batch.createdBy, signal);
  if (actor === null) return;
  await undoBatch(db, actor, batch.id, signal);
}

export async function enqueueUndoJob(batchId: string, signal: AbortSignal): Promise<void> {
  await enqueueBatchJob(PGBOSS_QUEUE_IMPORT_UNDO, batchId, signal);
}

export async function registerImportUndoWorker(boss: PgBoss): Promise<void> {
  await registerBatchWorker(boss, PGBOSS_QUEUE_IMPORT_UNDO, (job) =>
    handleUndoJob(prodDb, job, AbortSignal.timeout(IMPORT_JOB_TIMEOUT_MS)),
  );
}
