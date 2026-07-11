import type { Announcements } from "@dnd-kit/core";
import { STRINGS } from "@/constants/strings";

const A = STRINGS.board.announcements;

// Screen-reader announcements for board drags (UI 9.1). Extracted from Board.tsx so the
// component stays within the file-size budget; pure given the two name lookups.
export function boardAnnouncements(
  cardTitleById: Map<string, string>,
  stageNameById: Map<string, string>,
): Announcements {
  return {
    onDragStart: ({ active }) => {
      const title = cardTitleById.get(String(active.id)) ?? String(active.id);
      const stageId = (active.data.current as { stageId?: string } | undefined)?.stageId;
      const stageName = stageId !== undefined ? (stageNameById.get(stageId) ?? "") : "";
      return A.pickedUp(title, stageName);
    },
    onDragOver: ({ over }) => {
      if (over === null) return A.notOverColumn;
      return A.movedTo(stageNameById.get(String(over.id)) ?? String(over.id));
    },
    onDragEnd: ({ over }) => {
      if (over === null) return A.cancelled;
      return A.droppedIn(stageNameById.get(String(over.id)) ?? String(over.id));
    },
    onDragCancel: () => A.cancelled,
  };
}
