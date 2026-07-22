import type React from "react";
import { HistoryFeed } from "./HistoryFeed";
import type { HistoryItem } from "./historyTimeline";
import { SectionHeading } from "./SectionHeading";

// One pinned-note surface for deal, lead, person, and organization timelines. The partitioner
// guarantees this bucket contains only pinned notes and excludes them from History.
export function PinnedNotesSection({
  items,
  onNoteChanged,
}: {
  items: HistoryItem[];
  onNoteChanged?: () => void;
}): React.ReactNode {
  if (items.length === 0) return null;

  return (
    <section aria-label="pinned">
      <SectionHeading>Pinned</SectionHeading>
      <HistoryFeed items={items} emptyLabel="" onNoteChanged={onNoteChanged} />
    </section>
  );
}
