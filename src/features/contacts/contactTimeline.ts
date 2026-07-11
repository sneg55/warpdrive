// Merged Focus/History feed for a person or organization detail page (Wave 3, Task 21).
// Unions that contact's activities, notes, and change-log events through the same
// buildHistoryTimeline model the deal workspace uses (Task 17), so the contact page
// renders with the identical Focus/History split and card styling. No stage or
// "created" anchor here: contacts have neither a pipeline stage nor a synthesized
// creation card in the design, only the three read boundaries below.
import type { Db } from "@/db/client";
import { listActivitiesForEntity } from "@/features/activities/forEntity";
import { listChangeLog } from "@/features/collaboration/changeLog";
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

// Feed for a single person or organization, gated by the same canSee check the
// getPerson/getOrg loaders use: an actor who cannot see the contact gets an empty
// feed (never leak activity/note/change-log existence for a hidden record).
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

  // Visibility-consistent with the rest of the contact page: the same
  // listActivitiesForEntity forEntity.ts uses for the deal/person/org activity list,
  // so an activity hidden from this actor there stays hidden here too.
  const activityItems = await listActivitiesForEntity(db, actor, entityType, entityId, signal);
  signal.throwIfAborted();

  const noteRows = await listNotes(db, entityType, entityId, signal);
  signal.throwIfAborted();
  const noteItems: NoteItem[] = noteRows.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.createdAt,
  }));

  const changelog = await listChangeLog(db, entityType, entityId, signal);
  signal.throwIfAborted();

  return { items: buildHistoryTimeline(activityItems, changelog, noteItems) };
}
