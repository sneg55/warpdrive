import type { HistoryTab } from "./HistoryTypeTabs";
import type { HistoryItem } from "./historyTimeline";

export function countHistoryTabs(
  items: Record<HistoryTab, HistoryItem[]>,
  fileCount: number | undefined,
): Partial<Record<HistoryTab, number>> {
  return {
    all: items.all.length,
    activities: items.activities.length,
    notes: items.notes.length,
    email: items.email.length,
    changelog: items.changelog.length,
    files: fileCount,
  };
}

export function historyTabLabel(label: string, count: number | undefined): string {
  return count !== undefined && count > 0 ? `${label} (${count})` : label;
}
