import { Mail } from "lucide-react";
import type React from "react";
import type { DraftSummary } from "@/features/email/draftRepo";
import { EmailDraftCard } from "@/features/email/EmailDraftCard";
import type { EmailCardScope } from "@/features/email/EmailTimelineCard";
import { EmailTimelineCard } from "@/features/email/EmailTimelineCard";
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

// Rail marker per kind: notes an amber dot, emails an envelope, everything else a neutral dot.
// Activities do NOT get their type glyph on the rail: ActivityCard already shows the type icon next
// to the subject, and duplicating it on the rail made a task activity (whose glyph is a checkmark)
// look like it had a stray checkmark beside its still-empty done toggle.
function RailMarker({ item }: { item: HistoryItem }): React.ReactNode {
  if (item.kind === "email" || item.kind === "emailDraft") {
    return (
      <span
        aria-hidden="true"
        data-rail="email"
        className="absolute -left-[2.15rem] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
      >
        <Mail className="h-3 w-3" />
      </span>
    );
  }
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
  emailScope,
  onEmailChanged,
  onResumeDraft,
  onDraftChanged,
}: {
  items: HistoryItem[];
  emptyLabel: string;
  onActivityChanged?: () => void;
  // Invalidate the notes query after an in-feed note mutation (pin/edit/delete).
  onNoteChanged?: () => void;
  // Open an activity in the inline edit composer (deal workspace only).
  onEditActivity?: (activityId: string) => void;
  // Which record's timeline this is, for the email cards' unlink and reply.
  emailScope?: EmailCardScope;
  // Refetch the record's linked messages after an unlink or a sent reply.
  onEmailChanged?: () => void;
  // Open a draft in the host's composer. Absent on surfaces with no composer, where a draft row
  // simply does not render rather than offering a Continue that goes nowhere.
  onResumeDraft?: (draft: DraftSummary) => void;
  // Refetch the record's drafts after one is discarded.
  onDraftChanged?: () => void;
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
          {/* emailScope is absent on surfaces that carry no linked mail (a lead timeline), so an
              email item simply does not render there rather than guessing a scope. */}
          {item.kind === "emailDraft" && (
            <EmailDraftCard
              draft={item.draft}
              onResume={onResumeDraft}
              onChanged={onDraftChanged ?? ((): void => {})}
            />
          )}
          {item.kind === "email" && emailScope !== undefined && (
            <EmailTimelineCard
              message={item.message}
              scope={emailScope}
              onUnlinked={onEmailChanged ?? ((): void => {})}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
