import type React from "react";
import { PILL_TAB, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
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
  // Forwarded to the nested HistoryFeed; not yet wired to a note-level control (Task 6).
  onNoteChanged?: () => void;
  // Open an activity in the inline edit composer.
  onEditActivity?: (activityId: string) => void;
  // Which record's timeline this is, for the email cards' unlink and reply.
  emailScope?: EmailCardScope;
  // Overrides the Email tab's empty line while the linked-message read is loading or failed, so a
  // pending or broken read never reads as "no emails linked".
  emailEmptyLabel?: string;
  // Refetch the record's linked messages after an unlink or a sent reply.
  onEmailChanged?: () => void;
}

// The per-type filter row that used to be the entire "History" tab bar (Wave
// 3, Task 17: now nested under the History side of the Focus/History switch,
// filtering the History bucket instead of the raw activities/notes/changelog).
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
}: HistoryTypeTabsProps): React.ReactNode {
  return (
    <Tabs value={tab} onValueChange={(v) => onTab(v as HistoryTab)}>
      <TabsList className="flex-wrap gap-1">
        {TABS.map((t) => {
          const count = counts[t];
          return (
            <TabsTrigger key={t} value={t} className={PILL_TAB}>
              {TAB_LABELS[t]}
              {count !== undefined ? ` (${count})` : ""}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <div className="pt-4">
        {/* History is a view of what is attached, not a compose surface: read-only so the
            deal page shows one uploader (the compose bar's Files tab), not two. */}
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
          />
        )}
      </div>
    </Tabs>
  );
}
