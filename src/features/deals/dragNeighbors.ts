import type { BoardCard } from "./dealRepo";

// Given the destination stage's ORDERED cards and the index at which a card is
// dropped, return the two neighbor boardPosition values to feed midpoint().
// dropIndex is in the range 0..cardsInStage.length (inclusive at both ends).
// Pure: no side effects, no I/O.
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
