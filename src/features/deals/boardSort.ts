import { parseDealValue } from "@/lib/parseDealValue";
import type { BoardCard } from "./dealRepo";

// The ordered board sort keys we support today, driving the dropdown. Each maps to a field the
// board query already carries, so sorting stays a pure client-side re-order of the loaded cards.
// Options that need extra board-query columns/aggregations (created date, expected close, product
// and activity counts, email timestamps) are intentionally not here yet. The BoardSortKey union
// is derived from this array so there is one list to maintain.
export const BOARD_SORT_KEYS = [
  "nextActivity",
  "title",
  "value",
  "person",
  "organization",
  "updateTime",
  "owner",
] as const;

export type BoardSortKey = (typeof BOARD_SORT_KEYS)[number];

export type SortDirection = "asc" | "desc";

export const DEFAULT_SORT_KEY: BoardSortKey = "nextActivity";
export const DEFAULT_SORT_DIRECTION: SortDirection = "asc";

// Empty values (null name, no next activity, no amount) always sort last, independent of the
// asc/desc direction: an unset field is "least informative", not "smallest". Direction only
// flips the order among present values. Ties fall back to id so the order never jitters between
// renders.
function compareNullable<T>(
  a: T | null,
  b: T | null,
  cmp: (x: T, y: T) => number,
  dir: SortDirection,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const base = cmp(a, b);
  return dir === "asc" ? base : -base;
}

// One collator reused across every comparison: constructing/allocating an options object per
// call is the documented slow path for repeated locale-aware compares on a re-sort hot path.
const collator = new Intl.Collator(undefined, { sensitivity: "base" });
const byText = (x: string, y: string): number => collator.compare(x, y);
const byNumber = (x: number, y: number): number => x - y;
const byTime = (x: Date, y: Date): number => x.getTime() - y.getTime();

// A null/blank string collapses to null so blanks sort last (an empty person name is "unset").
function text(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function compareByKey(a: BoardCard, b: BoardCard, key: BoardSortKey, dir: SortDirection): number {
  switch (key) {
    case "nextActivity":
      return compareNullable(a.nextActivityAt, b.nextActivityAt, byTime, dir);
    case "title":
      return compareNullable(text(a.title), text(b.title), byText, dir);
    case "value":
      return compareNullable(parseDealValue(a.value), parseDealValue(b.value), byNumber, dir);
    case "person":
      return compareNullable(text(a.personName), text(b.personName), byText, dir);
    case "organization":
      return compareNullable(text(a.orgName), text(b.orgName), byText, dir);
    case "updateTime":
      return compareNullable(a.updatedAt, b.updatedAt, byTime, dir);
    case "owner":
      return compareNullable(text(a.ownerName), text(b.ownerName), byText, dir);
  }
}

/**
 * Returns a new array of cards sorted by the given key and direction. Pure and stable:
 * the input is not mutated, and equal cards fall back to id order so the board never
 * jitters between renders. Used per-column so each stage is sorted independently.
 */
export function sortBoardCards(
  cards: readonly BoardCard[],
  key: BoardSortKey,
  direction: SortDirection,
): BoardCard[] {
  return [...cards].sort((a, b) => {
    const primary = compareByKey(a, b, key, direction);
    return primary !== 0 ? primary : a.id.localeCompare(b.id);
  });
}
