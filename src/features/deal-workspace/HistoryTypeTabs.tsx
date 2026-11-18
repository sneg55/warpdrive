import type React from "react";
import { PILL_TAB, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import { historyTabLabel } from "@/features/deal-workspace/historyTabCounts";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import type { DraftSummary } from "@/features/email/draftRepo";
import type { EmailCardScope } from "@/features/email/EmailTimelineCard";
import { FileAttachments } from "@/features/files/FileAttachments";

export type HistoryTab = "all" | "activities" | "notes" | "email" | "files" | "changelog";

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
  email: "No emails linked to this deal yet.",
};

const TABS: HistoryTab[] = ["all", "activities", "notes", "email", "files", "changelog"];

interface HistoryTypeTabsProps {
  tab: HistoryTab;
  onTab: (t: HistoryTab) => void;
  counts: Partial<Record<HistoryTab, number>>;
  items: Record<HistoryTab, HistoryItem[]>;
  dealId: string;
  onActivityChanged?: () => void;
  onNoteChanged?: () => void;
  onEditActivity?: (activityId: string) => void;
  emailScope?: EmailCardScope;
  emailEmptyLabel?: string;
  onEmailChanged?: () => void;
  onResumeDraft?: (draft: DraftSummary) => void;
  onDraftChanged?: () => void;
}

export function HistoryTypeTabs({
  tab,
  onTab,
  counts,
  items,
  dealId,
  onActivityChanged,
  onNoteChanged,
  onEditActivity,
  emailScope,
  emailEmptyLabel,
  onEmailChanged,
  onResumeDraft,
  onDraftChanged,
}: HistoryTypeTabsProps): React.ReactNode {
  return (
    <Tabs value={tab} onValueChange={(v) => onTab(v as HistoryTab)}>
      <TabsList className="flex-wrap gap-1">
        {TABS.map((t) => (
          <TabsTrigger key={t} value={t} className={PILL_TAB}>
            {historyTabLabel(TAB_LABELS[t], counts[t])}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="pt-4">
        {tab === "files" && <FileAttachments entityType="deal" entityId={dealId} readOnly />}
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
            onEditActivity={onEditActivity}
            emailScope={emailScope}
            onEmailChanged={onEmailChanged}
            onResumeDraft={onResumeDraft}
            onDraftChanged={onDraftChanged}
          />
        )}
      </div>
    </Tabs>
  );
}
