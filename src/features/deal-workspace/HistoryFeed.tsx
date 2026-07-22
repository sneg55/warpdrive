import type React from "react";
import { ActivityCard } from "./history/ActivityCard";
import { AttributionLine } from "./history/AttributionLine";
import { CreatedCard } from "./history/CreatedCard";
import { NoteCard } from "./history/NoteCard";
import type { HistoryItem } from "./historyTimeline";

// Change-log event = a plain-text row (no card chrome), Pipedrive's audit-trail style.
function EventRow({
  label,
  at,
  actorName,
}: {
  label: string;
  at: Date;
  actorName: string | null;
}): React.ReactNode {
  return (
    <div className="py-0.5">
      <p className="text-sm text-foreground">{label}</p>
      <AttributionLine at={at} actorName={actorName} />
    </div>
  );
}

// Rail marker per kind: notes an amber dot, everything else a neutral dot. Activities do NOT get
// their type glyph on the rail: ActivityCard already shows the type icon next to the subject, and
// duplicating it on the rail made a task activity (whose glyph is a checkmark) look like it had a
// stray checkmark beside its still-empty done toggle.
function RailMarker({ item }: { item: HistoryItem }): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className={
        item.kind === "note"
          ? "absolute -left-[1.95rem] top-2.5 h-2.5 w-2.5 rounded-full border-2 border-warning bg-warning"
          : "absolute -left-[1.8rem] top-1.5 h-2 w-2 rounded-full border-2 border-muted-foreground/40 bg-card"
      }
    />
  );
}

// Shared deal-history timeline: a connector rail with a per-kind marker; created,
// stage, activity, note, and event blocks interleaved chronologically.
export function HistoryFeed({
  items,
  emptyLabel,
  onActivityChanged,
  onNoteChanged,
  onEditActivity,
}: {
  items: HistoryItem[];
  emptyLabel: string;
  onActivityChanged?: () => void;
  // Invalidate the notes query after an in-feed note mutation (pin/edit/delete).
  onNoteChanged?: () => void;
  // Open an activity in the inline edit composer (deal workspace only).
  onEditActivity?: (activityId: string) => void;
}): React.ReactNode {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ol className="relative ml-2 space-y-2 border-l pl-6">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <RailMarker item={item} />
          {item.kind === "created" && <CreatedCard at={item.at} actorName={item.actorName} />}
          {item.kind === "activity" && (
            <ActivityCard
              activity={item.activity}
              at={item.at}
              onChanged={onActivityChanged}
              onEdit={
                onEditActivity !== undefined ? () => onEditActivity(item.activity.id) : undefined
              }
            />
          )}
          {item.kind === "note" && (
            <NoteCard
              id={item.id}
              body={item.body}
              at={item.at}
              actorName={item.actorName}
              pinned={item.pinned}
              onChanged={onNoteChanged}
            />
          )}
          {item.kind === "event" && (
            <EventRow label={item.label} at={item.at} actorName={item.actorName} />
          )}
        </li>
      ))}
    </ol>
  );
}
