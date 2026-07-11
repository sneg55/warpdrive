import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { AppError } from "@/constants/errorIds";
import { IMPORT_JOB_TIMEOUT_MS, PGBOSS_QUEUE_IMPORT_UNDO } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { importBatches, importRows } from "@/db/schema";
import { ok, type Result } from "@/types/result";
import { narrowTarget } from "./batchHelpers";
import type { ImportActor } from "./commit";
import { loadImportActor } from "./importActor";
import { enqueueBatchJob, registerBatchWorker } from "./jobRunner";
import { publishImportProgress, shouldEmit } from "./progress";
import { type SideRemoval, undoOneRow } from "./undoDelete";

interface UndoJob {
  data: { batchId: string };
}

// Soft-delete every record the batch CREATED (status='imported' AND createdEntityId not
// null). Rows that updated a pre-existing record carry a null createdEntityId (see
// applyOneUpdate) and are never touched. Returns the count actually deleted, not attempted.
export async function undoBatch(
  db: Db,
  actor: ImportActor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<{ deleted: number }, AppError>> {
  const [batchRow] = await db
    .select({ t: importBatches.targetEntity, status: importBatches.status })
    .from(importBatches)
    .where(eq(importBatches.id, batchId));
  const target = narrowTarget(batchRow?.t ?? "person");
  // Remember the pre-undo status so we can restore it if the undo could not remove
  // everything (e.g. the actor lacks the delete flag for some rows): the batch must not
  // claim "undone" while created records are still live.
  const priorStatus = batchRow?.status ?? "completed";
  // Atomically claim: undo may start only from a terminal completed/partial batch, or resume
  // a crashed "undoing". A stale undo retry that fires after the batch is already "undone"
  // claims nothing and no-ops here, so it never resets undoneAt or reruns deletions.
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
  // Any row that CREATED something, whether that is its primary record or only a side effect. An
  // "update"-mode row carries a null createdEntityId (its contact predates the import and must
  // survive) yet may still have created an org and a note, which are this import's debris to clear.
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
  // Only rows with a primary record can contribute to the "every primary was deleted" check.
  const primaryCount = rows.filter((r) => r.id !== null).length;

  let processed = 0;
  let deleted = 0;
  // Records an import created as a SIDE EFFECT of a row: the org/person it linked by
  // find-or-create, and the row note. They must be removed too, or an undone import leaves orphan
  // organizations, people, and notes behind. A record a row merely LINKED to carries a null id
  // here and is never touched. Enrichment written onto a pre-existing org is likewise not
  // reverted: undo removes what the import created, not what it edited.
  const side: SideRemoval = { attempted: 0, removed: 0 };
  let lastEmitted = 0;
  for (const row of rows) {
    signal.throwIfAborted();
    if (await undoOneRow(db, actor, target, row, side, signal)) deleted += 1;
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

  // Only claim "undone" when every created record was actually removed: all primary entities AND
  // every side-effect org/person/note. If some deletions were skipped (permission denied on a row
  // the actor cannot delete), restore the prior terminal status so history stays truthful and Undo
  // remains available.
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
