import type { Db } from "@/db/client";
import { listActivitiesForEntity } from "@/features/activities/forEntity";
import { listChangeLogForViewer } from "@/features/collaboration/changeLog";
import { listNotes } from "@/features/collaboration/notesRepo";
import {
  buildHistoryTimeline,
  type HistoryItem,
  type NoteItem,
} from "@/features/deal-workspace/historyTimeline";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { toRefActor } from "./actorAdapters";

export interface ContactTimelineResult {
  items: HistoryItem[];
}

const EMPTY: ContactTimelineResult = { items: [] };

export async function contactTimeline(
  db: Db,
  actor: PermSetUser,
  entityType: "person" | "organization",
  entityId: string,
  signal: AbortSignal,
): Promise<ContactTimelineResult> {
  signal.throwIfAborted();
  const visible = await assertReferenceVisible(
    db,
    toRefActor(actor),
    { kind: entityType, id: entityId },
    signal,
  );
  if (!visible.ok) return EMPTY;
  signal.throwIfAborted();

  const activityItems = await listActivitiesForEntity(db, actor, entityType, entityId, signal);
  signal.throwIfAborted();

  const noteRows = await listNotes(db, entityType, entityId, signal);
  signal.throwIfAborted();
  const noteItems: NoteItem[] = noteRows.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.createdAt,
    entityType,
    entityId,
  }));

  const changelog = await listChangeLogForViewer(
    db,
    toRefActor(actor),
    entityType,
    entityId,
    signal,
  );
  signal.throwIfAborted();

  return { items: buildHistoryTimeline(activityItems, changelog, noteItems) };
}
