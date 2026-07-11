import { arrayMove } from "@dnd-kit/sortable";

// Given the current id order and a drag from activeId to overId, return the new
// id order. Returns a fresh copy unchanged when the ids match or either is absent.
export function reorderByDrag(ids: string[], activeId: string, overId: string): string[] {
  if (activeId === overId) return ids.slice();
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return ids.slice();
  return arrayMove(ids, from, to);
}
