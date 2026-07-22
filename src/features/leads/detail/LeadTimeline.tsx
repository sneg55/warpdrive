"use client";
import type React from "react";
import { useMemo, useState } from "react";
import { PILL_TAB, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import { partitionFocusHistory } from "@/features/deal-workspace/historyTimeline";
import { PinnedNotesSection } from "@/features/deal-workspace/PinnedNotesSection";
import type { TimelineView } from "@/features/deal-workspace/TimelineTabs";
import { TimelineTabs } from "@/features/deal-workspace/TimelineTabs";
import { MASK_CLASS } from "@/features/observability/replayMasking";
import { cn } from "@/lib/utils";
import type { LeadTimelineEmail } from "../leadTimeline";

type Tab = "all" | "activities" | "notes" | "email";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "activities", label: "Activities" },
  { key: "notes", label: "Notes" },
  { key: "email", label: "Email" },
];

function EmailList({ emails }: { emails: LeadTimelineEmail[] }): React.ReactNode {
  if (emails.length === 0) {
    return <p className="text-sm text-muted-foreground">No emails linked to this lead yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {emails.map((e) => (
        <li key={e.id} className="rounded-md border bg-card px-3 py-2">
          <p className="text-sm font-medium text-foreground">{e.subject ?? "(no subject)"}</p>
          <p className="text-xs text-muted-foreground">
            {e.direction} · {e.fromEmail}
          </p>
          {e.snippet !== null && (
            <p className={cn("mt-1 text-sm text-muted-foreground", MASK_CLASS)}>{e.snippet}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

// Lead detail timeline (Wave 3, Task 18): a Focus/History switch on top (mirrors the deal
// workspace, Task 17), then the existing All/Activities/Notes/Email type filters nested under
// History. Focus surfaces open activities only, so it never needs the type-filter row. Email
// stays out of the interleaved HistoryItem model (its own EmailList), matching the deal workspace.
// Presentational: data comes from the leadTimeline query.
export function LeadTimeline({
  items,
  emails,
  onNoteChanged,
}: {
  items: HistoryItem[];
  emails: LeadTimelineEmail[];
  onNoteChanged?: () => void;
}): React.ReactNode {
  const [view, setView] = useState<TimelineView>("history");
  const [tab, setTab] = useState<Tab>("all");
  const { pinned, focus, history } = useMemo(() => partitionFocusHistory(items), [items]);
  const activities = history.filter((i) => i.kind === "activity");
  const notes = history.filter((i) => i.kind === "note");

  return (
    <div className="space-y-6">
      <PinnedNotesSection items={pinned} onNoteChanged={onNoteChanged} />
      <TimelineTabs view={view} onView={setView}>
        {view === "focus" ? (
          <HistoryFeed items={focus} emptyLabel="Nothing needs your attention" />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="mb-3 flex-wrap gap-1">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className={PILL_TAB}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div>
              {tab === "all" && (
                <HistoryFeed
                  items={history}
                  emptyLabel="No history yet."
                  onNoteChanged={onNoteChanged}
                />
              )}
              {tab === "activities" && (
                <HistoryFeed items={activities} emptyLabel="No activities yet." />
              )}
              {tab === "notes" && (
                <HistoryFeed
                  items={notes}
                  emptyLabel="No notes yet."
                  onNoteChanged={onNoteChanged}
                />
              )}
              {tab === "email" && <EmailList emails={emails} />}
            </div>
          </Tabs>
        )}
      </TimelineTabs>
    </div>
  );
}
