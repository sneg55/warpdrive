import type { HistoryTab } from "./HistoryTypeTabs";
import type { HistoryItem } from "./historyTimeline";

// Files aren't timeline items, so their count comes from the Files read rather than the bucket.
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

// An empty tab shows its label alone: a "(0)" beside tabs that carry a real number reads as a
// badge that failed to load.
export function historyTabLabel(label: string, count: number | undefined): string {
  return count !== undefined && count > 0 ? `${label} (${count})` : label;
}
