import {
  CHANGE_FIELD_CUSTOM_PREFIX,
  CHANGE_FIELD_FOLLOWER,
  CHANGE_FIELD_ORG,
  CHANGE_FIELD_PARTICIPANT,
  CHANGE_FIELD_PERSON,
  CHANGE_FIELD_STAGE_ID,
  CHANGE_LABEL_CUSTOM_FIELD,
  CHANGE_LABEL_FOLLOWER_ADDED,
  CHANGE_LABEL_FOLLOWER_REMOVED,
  CHANGE_LABEL_ORG_CHANGED,
  CHANGE_LABEL_ORG_LINKED,
  CHANGE_LABEL_ORG_UNLINKED,
  CHANGE_LABEL_PARTICIPANT_ADDED,
  CHANGE_LABEL_PARTICIPANT_REMOVED,
  CHANGE_LABEL_PERSON_CHANGED,
  CHANGE_LABEL_PERSON_LINKED,
  CHANGE_LABEL_PERSON_UNLINKED,
} from "@/constants/changeLogFields";
import { isSourceChannelKey, SOURCE_CHANNELS } from "@/constants/sourceChannels";
import type { CalendarActivity } from "@/features/activities/calendar";
import type { ChangeLogEntry } from "@/features/collaboration/changeLog";

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
  | { kind: "event"; id: string; at: Date; label: string; actorName: string | null };

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

// Format a jsonb audit value for display; null/empty read as "(none)".
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return value.length === 0 ? "(none)" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

// Field-aware value formatting: resolve label-key arrays and source-channel keys to display names.
function formatFieldValue(field: string, value: unknown): string {
  if (field === "labels") {
    if (!Array.isArray(value) || value.length === 0) return "(none)";
    // Stored label values are the catalog display names, so render them directly.
    return value.map((k) => String(k)).join(", ");
  }
  if (field === "source_channel" || field === "sourceChannel") {
    if (typeof value === "string" && isSourceChannelKey(value)) return SOURCE_CHANNELS[value].name;
  }
  return formatValue(value);
}

// "expected_close_date" -> "Expected close date". Custom-field edits carry a dynamic def
// key under a prefix (custom_field:region); collapse them all to one generic "Custom field"
// label since the read layer does not resolve the def name here.
function humanizeField(field: string): string {
  if (field.startsWith(CHANGE_FIELD_CUSTOM_PREFIX)) return CHANGE_LABEL_CUSTOM_FIELD;
  const spaced = field.replace(/_/g, " ").trim();
  if (spaced.length === 0) return field;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Direction of a link change, inferred from which side is null: null->id = link/add,
// id->null = unlink/remove, id->id = change.
type LinkDir = "add" | "remove" | "change";
function linkDir(oldValue: unknown, newValue: unknown): LinkDir {
  const had = oldValue !== null && oldValue !== undefined;
  const has = newValue !== null && newValue !== undefined;
  if (!had) return "add";
  if (!has) return "remove";
  return "change";
}

// Directional phrasing per link field (the stored value is an opaque id we deliberately do
// not surface). Participants/followers only ever add or remove, so "change" reuses "add".
const PERSON_DIR: Record<LinkDir, string> = {
  add: CHANGE_LABEL_PERSON_LINKED,
  remove: CHANGE_LABEL_PERSON_UNLINKED,
  change: CHANGE_LABEL_PERSON_CHANGED,
};
const ORG_DIR: Record<LinkDir, string> = {
  add: CHANGE_LABEL_ORG_LINKED,
  remove: CHANGE_LABEL_ORG_UNLINKED,
  change: CHANGE_LABEL_ORG_CHANGED,
};
const PARTICIPANT_DIR: Record<LinkDir, string> = {
  add: CHANGE_LABEL_PARTICIPANT_ADDED,
  remove: CHANGE_LABEL_PARTICIPANT_REMOVED,
  change: CHANGE_LABEL_PARTICIPANT_ADDED,
};
const FOLLOWER_DIR: Record<LinkDir, string> = {
  add: CHANGE_LABEL_FOLLOWER_ADDED,
  remove: CHANGE_LABEL_FOLLOWER_REMOVED,
  change: CHANGE_LABEL_FOLLOWER_ADDED,
};
const DIRECTIONAL_FIELDS: Record<string, Record<LinkDir, string>> = {
  [CHANGE_FIELD_PERSON]: PERSON_DIR,
  [CHANGE_FIELD_ORG]: ORG_DIR,
  [CHANGE_FIELD_PARTICIPANT]: PARTICIPANT_DIR,
  [CHANGE_FIELD_FOLLOWER]: FOLLOWER_DIR,
};

// Returns a directional phrase for the link fields, or null so the caller falls back to the
// "field: old → new" diff form for every other field.
function directionalLabel(field: string, oldValue: unknown, newValue: unknown): string | null {
  const dir = DIRECTIONAL_FIELDS[field];
  if (dir === undefined) return null;
  return dir[linkDir(oldValue, newValue)];
}

export function formatChangeLabel(entry: {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}): string {
  const directional = directionalLabel(entry.field, entry.oldValue, entry.newValue);
  if (directional !== null) return directional;
  return `${humanizeField(entry.field)}: ${formatFieldValue(entry.field, entry.oldValue)} → ${formatFieldValue(entry.field, entry.newValue)}`;
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
