"use client";
import { useCallback, useMemo } from "react";
import type { Deal } from "@/db/schema";
import type { CalendarActivity } from "@/features/activities/calendar";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import type { HistoryTab } from "@/features/deal-workspace/HistoryTypeTabs";
import { HistoryTypeTabs } from "@/features/deal-workspace/HistoryTypeTabs";
import { resolveStageChangeNames } from "@/features/deal-workspace/history/stageNames";
import { countHistoryTabs } from "@/features/deal-workspace/historyTabCounts";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import {
  buildHistoryTimeline,
  mergeDraftItems,
  mergeEmailItems,
  mergeSupportItems,
  partitionFocusHistory,
} from "@/features/deal-workspace/historyTimeline";
import { PinnedNotesSection } from "@/features/deal-workspace/PinnedNotesSection";
import { SectionHeading } from "@/features/deal-workspace/SectionHeading";
import type { DraftSummary } from "@/features/email/draftRepo";
import { emailTabStatusLabel } from "@/features/email/emailTabStatus";
import { useSupportConversations } from "@/features/intercom/useSupportConversations";
import { trpc } from "@/lib/trpc-client";

const EMPTY: never[] = [];

type Tab = HistoryTab;

interface WorkspaceTabsProps {
  deal: Deal;
  tab: Tab;
  onTab: (t: Tab) => void;
  activities: CalendarActivity[];
  stages: { id: string; name: string }[];
  createdActorName: string | null;
  onActivityChanged?: () => void;
  onNoteChanged?: () => void;
  onEditActivity?: (activityId: string) => void;
  onResumeDraft?: (draft: DraftSummary) => void;
}

export function bucketByType(history: HistoryItem[]): Record<Tab, HistoryItem[]> {
  return {
    all: history,
    activities: history.filter((i) => i.kind === "activity"),
    notes: history.filter((i) => i.kind === "note"),
    changelog: history.filter((i) => i.kind === "event"),
    email: history.filter(
      (i) => i.kind === "email" || i.kind === "emailDraft" || i.kind === "supportConversation",
    ),
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
  onEditActivity,
  onResumeDraft,
}: WorkspaceTabsProps) {
  const notes =
    trpc.collaboration.listNotes.useQuery({ entityType: "deal", entityId: deal.id }).data ?? EMPTY;
  const changelog =
    trpc.collaboration.listChangeLog.useQuery({ entityType: "deal", entityId: deal.id }).data ??
    EMPTY;

  const resolvedChangelog = useMemo(() => {
    const stageNameById = new Map(stages.map((s) => [s.id, s.name]));
    return resolveStageChangeNames(changelog, stageNameById);
  }, [changelog, stages]);

  const createdAt = deal.createdAt;
  const createdAnchor = useMemo(
    () => ({ createdAt, actorName: createdActorName }),
    [createdAt, createdActorName],
  );

  const emailQuery = trpc.email.listMessagesForDeal.useQuery({ dealId: deal.id });
  const emails = emailQuery.data ?? EMPTY;
  const draftQuery = trpc.email.drafts.listForDeal.useQuery({ dealId: deal.id });
  const drafts = draftQuery.data ?? EMPTY;
  const utils = trpc.useUtils();
  const supportScope = useMemo(() => ({ kind: "deal" as const, dealId: deal.id }), [deal.id]);
  const support = useSupportConversations(supportScope);

  const allItems = useMemo(
    () =>
      mergeSupportItems(
        mergeDraftItems(
          mergeEmailItems(
            buildHistoryTimeline(activities, resolvedChangelog, notes, createdAnchor),
            emails,
          ),
          drafts,
        ),
        support,
        supportScope,
      ),
    [activities, resolvedChangelog, notes, createdAnchor, emails, drafts, support, supportScope],
  );
  const { pinned, focus, history } = useMemo(() => partitionFocusHistory(allItems), [allItems]);
  const historyByType = useMemo(() => bucketByType(history), [history]);

  const emailScope = useMemo(
    () => ({ kind: "deal" as const, dealId: deal.id, personId: deal.personId ?? undefined }),
    [deal.id, deal.personId],
  );
  const onEmailChanged = useCallback(() => {
    void utils.email.listMessagesForDeal.invalidate({ dealId: deal.id });
  }, [utils, deal.id]);
  const onDraftChanged = useCallback(() => {
    void utils.email.drafts.listForDeal.invalidate({ dealId: deal.id });
  }, [utils, deal.id]);

  const fileCount = trpc.files.listForEntity.useQuery({ entityType: "deal", entityId: deal.id })
    .data?.length;
  const counts: Partial<Record<Tab, number>> = countHistoryTabs(historyByType, fileCount);

  return (
    <div className="space-y-6">
      <PinnedNotesSection items={pinned} onNoteChanged={onNoteChanged} />

      {emailQuery.isError === true && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load emails for this deal. Please try again.
        </p>
      )}

      <section aria-label="focus">
        <SectionHeading>Focus</SectionHeading>
        <HistoryFeed
          items={focus}
          emptyLabel="Nothing needs your attention"
          onActivityChanged={onActivityChanged}
          onNoteChanged={onNoteChanged}
          onEditActivity={onEditActivity}
          emailScope={emailScope}
          onEmailChanged={onEmailChanged}
          onResumeDraft={onResumeDraft}
          onDraftChanged={onDraftChanged}
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
          onEditActivity={onEditActivity}
          emailScope={emailScope}
          emailEmptyLabel={emailTabStatusLabel(emailQuery)}
          onEmailChanged={onEmailChanged}
          onResumeDraft={onResumeDraft}
          onDraftChanged={onDraftChanged}
        />
      </section>
    </div>
  );
}
