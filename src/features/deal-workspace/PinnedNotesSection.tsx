import type React from "react";
import { HistoryFeed } from "./HistoryFeed";
import type { HistoryItem } from "./historyTimeline";
import { SectionHeading } from "./SectionHeading";

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
