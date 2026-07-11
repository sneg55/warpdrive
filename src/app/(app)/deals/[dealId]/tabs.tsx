"use client";
import { useMemo } from "react";
import type { Deal } from "@/db/schema";
import type { CalendarActivity } from "@/features/activities/calendar";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import type { HistoryTab } from "@/features/deal-workspace/HistoryTypeTabs";
import { HistoryTypeTabs } from "@/features/deal-workspace/HistoryTypeTabs";
import { resolveStageChangeNames } from "@/features/deal-workspace/history/stageNames";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import {
  buildHistoryTimeline,
  partitionFocusHistory,
} from "@/features/deal-workspace/historyTimeline";
import { SectionHeading } from "@/features/deal-workspace/SectionHeading";
import { trpc } from "@/lib/trpc-client";

// Stable empty array: a new [] on every render would churn useMemo dependencies below.
const EMPTY: never[] = [];

type Tab = HistoryTab;

interface WorkspaceTabsProps {
  deal: Deal;
  tab: Tab;
  onTab: (t: Tab) => void;
  activities: CalendarActivity[];
  // Pipeline stages (id + name) used to resolve stageId changelog rows to names.
  stages: { id: string; name: string }[];
  // Display name of the creating actor for the synthesized "Deal created" anchor.
  createdActorName: string | null;
  // Invalidate the activities query after an in-feed mutation (mark-as-done).
  onActivityChanged?: () => void;
  // Invalidate the notes query after an in-feed note mutation (pin/edit/delete, Task 6).
  onNoteChanged?: () => void;
}

// Buckets the History side's items by the per-type filter row (Wave 3, Task
// 17). "created" never appears under a type filter other than "all"; email
// and files aren't timeline items so they get an empty list (unused, those
// tabs render their own feature component instead of HistoryFeed).
export function bucketByType(history: HistoryItem[]): Record<Tab, HistoryItem[]> {
  return {
    all: history,
    activities: history.filter((i) => i.kind === "activity"),
    notes: history.filter((i) => i.kind === "note"),
    changelog: history.filter((i) => i.kind === "event"),
    email: [],
    files: [],
  };
}

export function WorkspaceTabs({
  deal,
  tab,
  onTab,
  activities,
  stages,
  createdActorName,
  onActivityChanged,
  onNoteChanged,
}: WorkspaceTabsProps) {
  // `?? EMPTY` rather than `?? []`: a fresh array literal each render changes the identity of every
  // downstream useMemo dependency, so the timeline was rebuilt on every render while data was absent.
  const notes =
    trpc.collaboration.listNotes.useQuery({ entityType: "deal", entityId: deal.id }).data ?? EMPTY;
  const changelog =
    trpc.collaboration.listChangeLog.useQuery({ entityType: "deal", entityId: deal.id }).data ??
    EMPTY;

  // Resolve stageId changelog rows (id values) to stage names before the model
  // builds the timeline, so the stage event row shows names, never raw ids.
  const resolvedChangelog = useMemo(() => {
    const stageNameById = new Map(stages.map((s) => [s.id, s.name]));
    return resolveStageChangeNames(changelog, stageNameById);
  }, [changelog, stages]);

  // Lazy "Deal created" anchor (decision 1): synthesized, not a persisted row, so
  // it appears in the interleaved "All" feed but not the raw Changelog audit trail.
  const createdAt = deal.createdAt;
  const createdAnchor = useMemo(
    () => ({ createdAt, actorName: createdActorName }),
    [createdAt, createdActorName],
  );

  // Focus vs History split (Wave 3, Task 17): Focus is the open/actionable
  // activities; History is everything else, filtered by the existing per-type tabs.
  const allItems = useMemo(
    () => buildHistoryTimeline(activities, resolvedChangelog, notes, createdAnchor),
    [activities, resolvedChangelog, notes, createdAnchor],
  );
  const { pinned, focus, history } = useMemo(() => partitionFocusHistory(allItems), [allItems]);
  const historyByType = useMemo(() => bucketByType(history), [history]);

  // Pipedrive shows counts on Activities/Notes only; the changelog tab has none.
  // Both badges count off the History bucket (what the tab's list actually shows), not the
  // raw totals: open activities live in Focus and pinned notes live above Focus, so counting
  // activities.length / notes.length would overstate the tab lists below.
  const counts: Partial<Record<Tab, number>> = {
    activities: historyByType.activities.length,
    notes: historyByType.notes.length,
  };

  return (
    <div className="space-y-6">
      {pinned.length > 0 && (
        <section aria-label="pinned">
          <SectionHeading>Pinned</SectionHeading>
          <HistoryFeed items={pinned} emptyLabel="" onNoteChanged={onNoteChanged} />
        </section>
      )}

      <section aria-label="focus">
        <SectionHeading>Focus</SectionHeading>
        <HistoryFeed
          items={focus}
          emptyLabel="Nothing needs your attention"
          onActivityChanged={onActivityChanged}
          onNoteChanged={onNoteChanged}
        />
      </section>

      <section aria-label="history">
        <SectionHeading>History</SectionHeading>
        <HistoryTypeTabs
          tab={tab}
          onTab={onTab}
          counts={counts}
          items={historyByType}
          dealId={deal.id}
          onActivityChanged={onActivityChanged}
          onNoteChanged={onNoteChanged}
        />
      </section>
    </div>
  );
}
