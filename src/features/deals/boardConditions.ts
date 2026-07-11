import { type Condition, matchesCondition } from "./boardQuickFilter";
import type { BoardCard } from "./dealRepo";

// Apply the toolbar quick-filter chips: a card is shown only if it matches EVERY active condition
// (AND semantics). Reuses matchesCondition so quick filters and saved filters share one evaluator.
// A chip with an empty value is treated as incomplete (inactive), so adding a fresh chip does not
// blank the board before the user types a value.
export function applyConditions(cards: BoardCard[], conditions: Condition[]): BoardCard[] {
  const active = conditions.filter((c) => c.value.trim() !== "");
  if (active.length === 0) return cards;
  return cards.filter((c) => active.every((cond) => matchesCondition(c, cond)));
}
