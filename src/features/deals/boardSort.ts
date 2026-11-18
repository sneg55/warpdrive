import { parseDealValue } from "@/lib/parseDealValue";
import type { BoardCard } from "./dealRepo";

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

const collator = new Intl.Collator(undefined, { sensitivity: "base" });
const byText = (x: string, y: string): number => collator.compare(x, y);
const byNumber = (x: number, y: number): number => x - y;
const byTime = (x: Date, y: Date): number => x.getTime() - y.getTime();

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
