"use client";
import type React from "react";
import { useState } from "react";
import { HistoryFeed } from "@/features/deal-workspace/HistoryFeed";
import type { HistoryTab } from "@/features/deal-workspace/HistoryTypeTabs";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import { FileAttachments } from "@/features/files/FileAttachments";

// Contact-scoped twin of the deal page's HistoryTypeTabs: the same per-type filter row
// (All/Activities/Notes/Email/Files/Changelog), but Email/Files render the contact's own
// email panel + attachments instead of the deal-scoped ones. The deal-workspace originals
// are reused read-only (HistoryFeed) rather than modified, since they hard-code a dealId.
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

interface ContactHistoryTabsProps {
  entityType: "person" | "organization";
  entityId: string;
  items: Record<HistoryTab, HistoryItem[]>;
  counts: Partial<Record<HistoryTab, number>>;
  // The contact's email surface (PersonEmailTab / OrgEmailPanel), rendered under the Email tab.
  emailPanel: React.ReactNode;
  onActivityChanged?: () => void;
  onNoteChanged?: () => void;
}

export function ContactHistoryTabs({
  entityType,
  entityId,
  items,
  counts,
  emailPanel,
  onActivityChanged,
  onNoteChanged,
}: ContactHistoryTabsProps): React.ReactNode {
  const [tab, setTab] = useState<HistoryTab>("all");

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const count = counts[t];
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
                  : "rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }
            >
              {TAB_LABELS[t]}
              {count !== undefined ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="pt-4">
        {tab === "email" && emailPanel}
        {/* History is a view of what is attached, not a compose surface: read-only, mirroring
            the deal page's Files filter. */}
        {tab === "files" && (
          <FileAttachments entityType={entityType} entityId={entityId} readOnly />
        )}
        {tab !== "email" && tab !== "files" && (
          <HistoryFeed
            items={items[tab]}
            emptyLabel={EMPTY_LABELS[tab] ?? "No history yet."}
            onActivityChanged={onActivityChanged}
            onNoteChanged={onNoteChanged}
          />
        )}
      </div>
    </div>
  );
}
