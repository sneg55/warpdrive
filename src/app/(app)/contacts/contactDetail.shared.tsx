"use client";
// Shared building blocks for the person and organization detail pages. Extracted so
// PersonDetailClient and OrgDetailClient each stay under the 200-line file budget and
// the tab strip / placeholder copy cannot drift between the two pages.
import type React from "react";
import { bucketByType } from "@/app/(app)/deals/[dealId]/tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollapsibleSection } from "@/features/deal-workspace/CollapsibleSection";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import { mergeEmailItems, partitionFocusHistory } from "@/features/deal-workspace/historyTimeline";
import { PinnedNotesSection } from "@/features/deal-workspace/PinnedNotesSection";
import { SectionHeading } from "@/features/deal-workspace/SectionHeading";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import { emailTabStatusLabel } from "@/features/email/emailTabStatus";
import { FileAttachments } from "@/features/files/FileAttachments";
import { trpc } from "@/lib/trpc-client";
import { ContactHistoryTabs } from "./ContactHistoryTabs";

const EMPTY_CLASS = "text-sm text-gray-500";
// Threads link to person_id (and deal_id), never to an organization, so an org's Email filter
// states the reason instead of implying the record merely has no mail yet.
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
      <TabsList className="gap-2 border-b border-gray-200 mb-3">
        {tabs.map((t) => (
          <TabsTrigger
            key={t}
            value={t}
            className="px-3 py-2 text-gray-600 hover:text-gray-900 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:font-medium data-[state=active]:text-blue-700"
          >
            {labels[t]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

// Generic list panel: renders an empty-state line or maps each item to a <li>.
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

// Merged Focus/History feed (Wave 3, Task 21): replaces the old per-type read-only
// Activities/Notes/Changelog tabs with one interleaved timeline, reusing the deal
// workspace's Focus/History split (Task 17) so the contact page and the deal workspace
// read identically. Self-contained: owns its own query and mark-done invalidation, so
// PersonDetailClient/OrgDetailClient just mount it, no data plumbing required.
export function ContactTimelinePanel({
  entityType,
  entityId,
}: {
  entityType: "person" | "organization";
  entityId: string;
}): React.ReactNode {
  const utils = trpc.useUtils();
  // Called unconditionally and merely disabled for an organization: a hook may not sit behind a
  // branch, and this panel serves both entity types.
  const emailQuery = trpc.email.listMessagesForContact.useQuery(
    { personId: entityId },
    { enabled: entityType === "person" },
  );
  const rawItems =
    trpc.contacts.contactTimeline.useQuery({ entityType, entityId }).data?.items ?? [];
  const items = mergeEmailItems(rawItems, emailQuery.data ?? []);
  const { pinned, focus, history } = partitionFocusHistory(items);
  const historyByType = bucketByType(history);

  // Pipedrive shows counts on Activities/Notes only (the changelog tab has none). Activities
  // counts off the History bucket (completed only): open activities live in Focus, so the badge
  // must match what the History Activities list actually shows.
  const counts: Partial<Record<string, number>> = {
    activities: historyByType.activities.length,
    notes: historyByType.notes.length,
  };

  function onActivityChanged(): void {
    void utils.contacts.contactTimeline.invalidate({ entityType, entityId });
    // Overview counts + inactive-days derive from activities, so keep them in sync on complete/edit.
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

  // S1: Focus and History are stacked, always-visible sections (not a toggle), mirroring the
  // deal page so the two read identically. CO-1: History gets the deal page's per-type filter row.
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

export function CustomFieldsPanel<T extends { id: string; key: string; name: string }>({
  defs,
  values,
  renderValue,
}: {
  defs: T[];
  values: Record<string, unknown>;
  renderValue: (def: T, value: unknown) => React.ReactNode;
}): React.ReactNode {
  if (defs.length === 0) return null;
  // CO-2: render as a CollapsibleSection (collapse toggle + shared 16px/600 heading) using the
  // shared FieldRow so labels/values align with every other sidebar section instead of the old
  // bespoke bordered <section> with a 14px/500 heading and hard-coded gray tokens.
  return (
    <CollapsibleSection title="Custom fields">
      {defs.map((def) => {
        const value = values[def.key];
        return (
          <FieldRow
            key={def.id}
            label={def.name}
            empty={value === null || value === undefined || value === ""}
          >
            {renderValue(def, value)}
          </FieldRow>
        );
      })}
    </CollapsibleSection>
  );
}
