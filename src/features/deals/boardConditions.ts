import { type Condition, matchesCondition } from "./boardQuickFilter";
import type { BoardCard } from "./dealRepo";

export function applyConditions(cards: BoardCard[], conditions: Condition[]): BoardCard[] {
  const active = conditions.filter((c) => c.value.trim() !== "");
  if (active.length === 0) return cards;
  return cards.filter((c) => active.every((cond) => matchesCondition(c, cond)));
}
