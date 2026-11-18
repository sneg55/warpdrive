"use client";
import type React from "react";
import { useState } from "react";
import { PILL_TAB, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import type { HistoryTab } from "@/features/deal-workspace/HistoryTypeTabs";
import { historyTabLabel } from "@/features/deal-workspace/historyTabCounts";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import type { EmailCardScope } from "@/features/email/EmailTimelineCard";
import { FileAttachments } from "@/features/files/FileAttachments";

const TAB_LABELS: Record<HistoryTab, string> = {
  all: "All",
  activities: "Activities",
  notes: "Notes",
  email: "Email",
  files: "Files",
  changelog: "Changelog",
};

const EMPTY_LABELS: Partial<Record<HistoryTab, string>> = {
  all: "No history yet.",
  activities: "No activities yet.",
  notes: "No notes yet.",
  changelog: "No changes recorded yet.",
  email: "No emails linked to this contact yet.",
};

const TABS: HistoryTab[] = ["all", "activities", "notes", "email", "files", "changelog"];

interface ContactHistoryTabsProps {
  entityType: "person" | "organization";
  entityId: string;
  items: Record<HistoryTab, HistoryItem[]>;
  counts: Partial<Record<HistoryTab, number>>;
  emailScope?: EmailCardScope;
  emailEmptyLabel?: string;
  onActivityChanged?: () => void;
  onNoteChanged?: () => void;
  onEmailChanged?: () => void;
}

export function ContactHistoryTabs({
  entityType,
  entityId,
  items,
  counts,
  emailScope,
  emailEmptyLabel,
  onActivityChanged,
  onNoteChanged,
  onEmailChanged,
}: ContactHistoryTabsProps): React.ReactNode {
  const [tab, setTab] = useState<HistoryTab>("all");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as HistoryTab)}>
      <TabsList className="flex-wrap gap-1">
        {TABS.map((t) => (
          <TabsTrigger key={t} value={t} className={PILL_TAB}>
            {historyTabLabel(TAB_LABELS[t], counts[t])}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="pt-4">
        {tab === "files" && (
          <FileAttachments entityType={entityType} entityId={entityId} readOnly />
        )}
        {tab !== "files" && (
          <HistoryFeed
            items={items[tab]}
            emptyLabel={
              (tab === "email" ? emailEmptyLabel : undefined) ??
              EMPTY_LABELS[tab] ??
              "No history yet."
            }
            onActivityChanged={onActivityChanged}
            onNoteChanged={onNoteChanged}
            emailScope={emailScope}
            onEmailChanged={onEmailChanged}
          />
        )}
      </div>
    </Tabs>
  );
}
