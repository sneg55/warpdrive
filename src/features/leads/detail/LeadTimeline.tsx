"use client";
import type React from "react";
import { useMemo, useState } from "react";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import { partitionFocusHistory } from "@/features/deal-workspace/historyTimeline";
import type { TimelineView } from "@/features/deal-workspace/TimelineTabs";
import { TimelineTabs } from "@/features/deal-workspace/TimelineTabs";
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
          {e.snippet !== null && <p className="mt-1 text-sm text-muted-foreground">{e.snippet}</p>}
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
}: {
  items: HistoryItem[];
  emails: LeadTimelineEmail[];
}): React.ReactNode {
  const [view, setView] = useState<TimelineView>("history");
  const [tab, setTab] = useState<Tab>("all");
  const { focus, history } = useMemo(() => partitionFocusHistory(items), [items]);
  const activities = history.filter((i) => i.kind === "activity");
  const notes = history.filter((i) => i.kind === "note");

  return (
    <TimelineTabs view={view} onView={setView}>
      {view === "focus" ? (
        <HistoryFeed items={focus} emptyLabel="Nothing needs your attention" />
      ) : (
        <div>
          <div role="tablist" className="mb-3 flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={
                  tab === t.key
                    ? "rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
                    : "rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {tab === "all" && <HistoryFeed items={history} emptyLabel="No history yet." />}
            {tab === "activities" && (
              <HistoryFeed items={activities} emptyLabel="No activities yet." />
            )}
            {tab === "notes" && <HistoryFeed items={notes} emptyLabel="No notes yet." />}
            {tab === "email" && <EmailList emails={emails} />}
          </div>
        </div>
      )}
    </TimelineTabs>
  );
}
