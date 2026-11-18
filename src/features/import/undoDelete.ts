import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { deals, leads, notes, persons } from "@/db/schema";
import { deleteActivity } from "@/features/activities/activityDelete";
import { softDeleteNote } from "@/features/collaboration/notesRepo";
import { deleteOrg } from "@/features/contacts/deleteOrg";
import { deletePerson } from "@/features/contacts/deletePerson";
import { deleteDeal } from "@/features/deals/deleteDeal";
import { bulkUpdateLeads } from "@/features/leads/leadBulk";
import { assertNever } from "@/types/result";
import type { ImportActor } from "./commit";
import { toEntityCreateSession } from "./commitHelpers";
import { deleteMappingsForRecords, type ImportContext } from "./externalIds";
import { lockImportMutation } from "./importLock";
import { alreadyGone } from "./undoGone";
import type { ImportTarget } from "./wizardState";

export interface SideRemoval {
  attempted: number;
  removed: number;
}

export interface UndoRow {
  id: string | null;
  orgId: string | null;
  personId: string | null;
  noteId: string | null;
}

async function removeSideContacts(
  db: Db,
  actor: ImportActor,
  row: UndoRow,
  side: SideRemoval,
  removedIds: string[],
  signal: AbortSignal,
): Promise<void> {
  if (row.personId !== null) {
    const r = await deletePerson(db, actor, row.personId, signal);
    side.attempted += 1;
    if (r.ok) removedIds.push(row.personId);
    if (r.ok || (await alreadyGone(db, "person", row.personId, signal))) side.removed += 1;
  }
  if (row.orgId !== null) {
    const r = await deleteOrg(db, actor, row.orgId, signal);
    side.attempted += 1;
    if (r.ok) removedIds.push(row.orgId);
    if (r.ok || (await alreadyGone(db, "organization", row.orgId, signal))) {
      side.removed += 1;
      await clearOrgLinks(db, row.orgId, signal);
    }
  }
}

async function clearOrgLinks(db: Db, orgId: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await db
    .update(persons)
    .set({ orgId: null })
    .where(and(eq(persons.orgId, orgId), isNull(persons.deletedAt)));
  await db
    .update(deals)
    .set({ orgId: null })
    .where(and(eq(deals.orgId, orgId), isNull(deals.deletedAt)));
  await db
    .update(leads)
    .set({ orgId: null })
    .where(and(eq(leads.orgId, orgId), isNull(leads.deletedAt)));
}

async function softDeleteCreatedNote(db: Db, noteId: string): Promise<boolean> {
  const [row] = await db
    .update(notes)
    .set({ deletedAt: new Date() })
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
    .returning({ id: notes.id });
  if (row !== undefined) return true;
  const [existing] = await db.select({ id: notes.id }).from(notes).where(eq(notes.id, noteId));
  return existing !== undefined;
}

async function deleteOne(
  db: Db,
  actor: ImportActor,
  target: ImportTarget,
  id: string,
  signal: AbortSignal,
): Promise<boolean> {
  switch (target) {
    case "person":
      return (await deletePerson(db, actor, id, signal)).ok;
    case "organization":
      return (await deleteOrg(db, actor, id, signal)).ok;
    case "activity":
      return (await deleteActivity(db, actor, id, signal)).ok;
    case "deal":
      return (await deleteDeal(db, actor, id, signal)).ok;
    case "lead": {
      const r = await bulkUpdateLeads(
        db,
        toEntityCreateSession(actor),
        { ids: [id], change: { deleted: true } },
        signal,
      );
      return r.ok && r.value.updated > 0;
    }
    case "note":
      return (await softDeleteNote(db, actor, id, signal)).ok;
    default:
      return assertNever(target);
  }
}

export function undoOneRow(
  db: Db,
  actor: ImportActor,
  target: ImportTarget,
  row: UndoRow,
  side: SideRemoval,
  ctx: ImportContext,
  signal: AbortSignal,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockImportMutation(tx, signal);
    return undoRowLocked(tx, actor, target, row, side, ctx, signal);
  });
}

async function undoRowLocked(
  db: Db,
  actor: ImportActor,
  target: ImportTarget,
  row: UndoRow,
  side: SideRemoval,
  ctx: ImportContext,
  signal: AbortSignal,
): Promise<boolean> {
  const removedIds: string[] = [];
  if (row.id !== null) {
    const deleted = await deleteOne(db, actor, target, row.id, signal);
    if (deleted) removedIds.push(row.id);
    const primaryGone = deleted || (await alreadyGone(db, target, row.id, signal));
    if (!primaryGone) return false;
  }

  if (row.noteId !== null) {
    side.attempted += 1;
    if (await softDeleteCreatedNote(db, row.noteId)) side.removed += 1;
  }
  await removeSideContacts(db, actor, row, side, removedIds, signal);
  if (ctx.source === "pipedrive") {
    await deleteMappingsForRecords(db, ctx.batchId, removedIds, signal);
  }
  return row.id !== null;
}
