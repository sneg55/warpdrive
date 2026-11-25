import type { HistoryTab } from "./HistoryTypeTabs";
import type { HistoryItem } from "./historyTimeline";

function countable(items: HistoryItem[]): number {
  return items.filter((i) => i.kind !== "marketingTruncated").length;
}

export function countHistoryTabs(
  items: Record<HistoryTab, HistoryItem[]>,
  fileCount: number | undefined,
): Partial<Record<HistoryTab, number>> {
  return {
    all: countable(items.all),
    activities: items.activities.length,
    notes: items.notes.length,
    email: countable(items.email),
    changelog: items.changelog.length,
    files: fileCount,
  };
}

export function historyTabLabel(label: string, count: number | undefined): string {
  return count !== undefined && count > 0 ? `${label} (${count})` : label;
}
