import { CHANGE_FIELD_STAGE_ID } from "@/constants/changeLogFields";
import type { CalendarActivity } from "@/features/activities/calendar";
import type { ChangeLogEntry } from "@/features/collaboration/changeLog";
import type { DraftSummary } from "@/features/email/draftRepo";
import type { EmailTimelineMessage } from "@/features/email/entityMessageReads";
import { formatChangeLabel, formatValue } from "./changeLabel";

export { formatChangeLabel } from "./changeLabel";

// A unified deal-history feed (Pipedrive parity): activities render as cards,
// notes as note cards, stage moves as an inline event row, a synthesized "Deal
// created" anchor, and remaining audit-trail changes as plain-text rows. Every
// block except the activity card carries the resolved actor name so the renderer
// can show Pipedrive's "Name (Web App)" attribution line. All are interleaved
// chronologically so "All" reads as one timeline.
export type HistoryItem =
  | { kind: "created"; id: string; at: Date; actorName: string | null }
  | { kind: "activity"; id: string; at: Date; activity: CalendarActivity }
  | { kind: "note"; id: string; at: Date; body: string; pinned: boolean; actorName: string | null }
  | { kind: "event"; id: string; at: Date; label: string; actorName: string | null }
  // One linked email, per message rather than per thread: Pipedrive splits a thread across the
  // timeline so each message sits at its own moment. The body is absent, it loads on expand.
  | { kind: "email"; id: string; at: Date; message: EmailTimelineMessage }
  // An unsent draft linked to this record. Author-only (the read is owner-scoped), and ordered by
  // its last edit since it has no sent time.
  | { kind: "emailDraft"; id: string; at: Date; draft: DraftSummary };

export interface NoteItem {
  id: string;
  body: string;
  createdAt: Date;
  // Author display name for the attribution line; optional/null when unresolved.
  actorName?: string | null;
  pinned?: boolean;
}

// Lazy "Deal created" anchor (decision 1: no persisted sentinel row). Synthesized
// from the deal's createdAt plus the creating actor's name when the caller passes it.
export interface CreatedAnchor {
  createdAt: Date;
  actorName: string | null;
}

// Every change log entry renders as a plain-text event row. A stageId change reads as
// "Stage: from → to", the same inline shape as a status change, rather than a boxed card.
// Stage from/to are the already-resolved NAMES the read layer wrote onto old/new (it holds
// the pipeline's stages), so no id leaks here.
function toChangeItem(c: ChangeLogEntry): HistoryItem {
  const label =
    c.field === CHANGE_FIELD_STAGE_ID
      ? `Stage: ${formatValue(c.oldValue)} → ${formatValue(c.newValue)}`
      : formatChangeLabel(c);
  return {
    kind: "event",
    id: c.id,
    at: c.createdAt,
    label,
    actorName: c.actorName,
  };
}

export function buildHistoryTimeline(
  activities: CalendarActivity[],
  changelog: ChangeLogEntry[],
  notes: NoteItem[] = [],
  created?: CreatedAnchor,
): HistoryItem[] {
  const items: HistoryItem[] = [
    ...activities.map(
      (a): HistoryItem => ({ kind: "activity", id: a.id, at: a.dueAt, activity: a }),
    ),
    ...notes.map(
      (n): HistoryItem => ({
        kind: "note",
        id: n.id,
        at: n.createdAt,
        body: n.body,
        pinned: n.pinned ?? false,
        actorName: n.actorName ?? null,
      }),
    ),
    ...changelog.map(toChangeItem),
  ];
  if (created !== undefined) {
    items.push({
      kind: "created",
      id: "deal-created",
      at: created.createdAt,
      actorName: created.actorName,
    });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

// Pinned / Focus / History split (Pipedrive parity): Pinned notes float to the very top of the
// feed (above Focus) so they stay in view regardless of age; Focus surfaces open/actionable
// activities so the user knows what to do next; History is the read-only log of everything else
// (completed activities, unpinned notes, stage/event changes, the created anchor). Pure and
// order-preserving: every bucket stays newest-first because it is filtered straight out of the
// already-sorted timeline. A pinned note lands only in Pinned, never also in History.
export function partitionFocusHistory(items: HistoryItem[]): {
  pinned: HistoryItem[];
  focus: HistoryItem[];
  history: HistoryItem[];
} {
  const pinned: HistoryItem[] = [];
  const focus: HistoryItem[] = [];
  const history: HistoryItem[] = [];
  for (const item of items) {
    if (item.kind === "note" && item.pinned) pinned.push(item);
    else if (item.kind === "activity" && item.activity.done === false) focus.push(item);
    else history.push(item);
  }
  return { pinned, focus, history };
}

// Fold linked emails into an already-built record timeline. Kept separate from
// buildHistoryTimeline because the two surfaces that need it merge in different places: the deal
// page builds client-side, the person page reads an already-merged list from contactTimeline.
export function mergeEmailItems(
  items: HistoryItem[],
  emails: EmailTimelineMessage[],
): HistoryItem[] {
  if (emails.length === 0) return items;
  const emailItems: HistoryItem[] = emails.map((m) => ({
    kind: "email",
    // Keyed by message, not thread: two messages of one conversation are two timeline rows.
    id: m.messageId,
    // createdAt stands in when Gmail sent no Date header, which keeps such a message in a
    // deterministic slot instead of at the epoch.
    at: new Date(m.sentAt ?? m.createdAt),
    message: m,
  }));
  return [...items, ...emailItems].sort((a, b) => b.at.getTime() - a.at.getTime());
}

// Fold this actor's unsent drafts into a record timeline. Separate from mergeEmailItems because
// drafts come from a different read (owner-scoped) and are ordered by last edit, not send time.
export function mergeDraftItems(items: HistoryItem[], drafts: DraftSummary[]): HistoryItem[] {
  if (drafts.length === 0) return items;
  const draftItems: HistoryItem[] = drafts.map((d) => ({
    kind: "emailDraft",
    id: d.id,
    at: new Date(d.updatedAt),
    draft: d,
  }));
  return [...items, ...draftItems].sort((a, b) => b.at.getTime() - a.at.getTime());
}
