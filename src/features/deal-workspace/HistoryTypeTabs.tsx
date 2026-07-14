import type React from "react";
import { PILL_TAB, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import { DealEmailTab } from "@/features/email/DealEmailTab";
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
        {tab === "email" && <DealEmailTab dealId={dealId} />}
        {/* History is a view of what is attached, not a compose surface: read-only so the
            deal page shows one uploader (the compose bar's Files tab), not two. */}
        {tab === "files" && <FileAttachments entityType="deal" entityId={dealId} readOnly />}
        {tab !== "email" && tab !== "files" && (
          <HistoryFeed
            items={items[tab]}
            emptyLabel={EMPTY_LABELS[tab] ?? "No history yet."}
            onActivityChanged={onActivityChanged}
            onNoteChanged={onNoteChanged}
          />
        )}
      </div>
    </Tabs>
  );
}
