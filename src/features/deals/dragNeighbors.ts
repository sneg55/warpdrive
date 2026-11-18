import type { BoardCard } from "./dealRepo";

export function resolveNeighbors(
  cardsInStage: BoardCard[],
  dropIndex: number,
): { beforePosition: string | null; afterPosition: string | null } {
  const beforePosition =
    dropIndex > 0 ? (cardsInStage[dropIndex - 1]?.boardPosition ?? null) : null;
  const afterPosition =
    dropIndex < cardsInStage.length ? (cardsInStage[dropIndex]?.boardPosition ?? null) : null;
  return { beforePosition, afterPosition };
}
