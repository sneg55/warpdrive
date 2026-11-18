"use client";
import type React from "react";
import { bucketByType } from "@/app/(app)/deals/[dealId]/tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import { countHistoryTabs } from "@/features/deal-workspace/historyTabCounts";
import {
  mergeEmailItems,
  mergeSupportItems,
  partitionFocusHistory,
} from "@/features/deal-workspace/historyTimeline";
import { PinnedNotesSection } from "@/features/deal-workspace/PinnedNotesSection";
import { SectionHeading } from "@/features/deal-workspace/SectionHeading";
import { emailTabStatusLabel } from "@/features/email/emailTabStatus";
import { FileAttachments } from "@/features/files/FileAttachments";
import { useSupportConversations } from "@/features/intercom/useSupportConversations";
import { trpc } from "@/lib/trpc-client";
import { ContactHistoryTabs } from "./ContactHistoryTabs";

const EMPTY_CLASS = "text-sm text-muted-foreground";
const ORG_EMAIL_EMPTY = "Email is tracked on people, not organizations.";
const EMAIL_LOAD_ERROR = "Couldn't load emails for this contact. Please try again.";

export function TabStrip<T extends string>({
  tabs,
  labels,
  active,
  onSelect,
}: {
  tabs: readonly T[];
  labels: Record<T, string>;
  active: T;
  onSelect: (t: T) => void;
}): React.ReactNode {
  return (
    <Tabs value={active} onValueChange={(v) => onSelect(v as T)}>
      <TabsList className="gap-2 border-b mb-3">
        {tabs.map((t) => (
          <TabsTrigger
            key={t}
            value={t}
            className="px-3 py-2 text-muted-foreground hover:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-link data-[state=active]:font-medium data-[state=active]:text-link"
          >
            {labels[t]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function ListPanel<T>({
  items,
  empty,
  render,
}: {
  items: T[];
  empty: string;
  render: (item: T) => React.ReactNode;
}): React.ReactNode {
  return (
    <ul className="space-y-2">
      {items.length === 0 ? (
        <li className={EMPTY_CLASS}>{empty}</li>
      ) : (
        items.map((item) => render(item))
      )}
    </ul>
  );
}

export function ContactTimelinePanel({
  entityType,
  entityId,
}: {
  entityType: "person" | "organization";
  entityId: string;
}): React.ReactNode {
  const utils = trpc.useUtils();
  const emailQuery = trpc.email.listMessagesForContact.useQuery(
    { personId: entityId },
    { enabled: entityType === "person" },
  );
  const rawItems =
    trpc.contacts.contactTimeline.useQuery({ entityType, entityId }).data?.items ?? [];
  const supportScope =
    entityType === "person" ? ({ kind: "person", personId: entityId } as const) : null;
  const support = useSupportConversations(supportScope);
  const withEmail = mergeEmailItems(rawItems, emailQuery.data ?? []);
  const items =
    supportScope === null ? withEmail : mergeSupportItems(withEmail, support, supportScope);
  const { pinned, focus, history } = partitionFocusHistory(items);
  const historyByType = bucketByType(history);

  const fileCount = trpc.files.listForEntity.useQuery({ entityType, entityId }).data?.length;
  const counts = countHistoryTabs(historyByType, fileCount);

  function onActivityChanged(): void {
    void utils.contacts.contactTimeline.invalidate({ entityType, entityId });
    void utils.contacts.activityStats.invalidate({ entityType, entityId });
  }

  function onNoteChanged(): void {
    void utils.contacts.contactTimeline.invalidate({ entityType, entityId });
  }

  function onEmailChanged(): void {
    void utils.email.listMessagesForContact.invalidate({ personId: entityId });
  }

  const emailScope =
    entityType === "person" ? ({ kind: "person", personId: entityId } as const) : undefined;

  return (
    <div className="space-y-6">
      {emailQuery.isError && (
        <p role="alert" className="text-sm text-red-600">
          {EMAIL_LOAD_ERROR}
        </p>
      )}
      <PinnedNotesSection items={pinned} onNoteChanged={onNoteChanged} />
      <section aria-label="focus">
        <SectionHeading>Focus</SectionHeading>
        <HistoryFeed
          items={focus}
          emptyLabel="Nothing needs your attention"
          onActivityChanged={onActivityChanged}
        />
      </section>
      <section aria-label="history">
        <SectionHeading>History</SectionHeading>
        <ContactHistoryTabs
          entityType={entityType}
          entityId={entityId}
          items={historyByType}
          counts={counts}
          emailScope={emailScope}
          emailEmptyLabel={
            emailTabStatusLabel(emailQuery) ??
            (entityType === "organization" ? ORG_EMAIL_EMPTY : undefined)
          }
          onActivityChanged={onActivityChanged}
          onNoteChanged={onNoteChanged}
          onEmailChanged={onEmailChanged}
        />
      </section>
    </div>
  );
}

export function FilesPanel({
  entityType,
  entityId,
}: {
  entityType: "person" | "organization";
  entityId: string;
}): React.ReactNode {
  return <FileAttachments entityType={entityType} entityId={entityId} />;
}
