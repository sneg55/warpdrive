export type BoardEmptyKind = "none" | "filtered" | "unsure" | "empty";

export interface BoardEmptyInput {
  shownCount: number;
  liveCount: number;
  filtered: boolean;
}

export function boardEmptyKind({
  shownCount,
  liveCount,
  filtered,
}: BoardEmptyInput): BoardEmptyKind {
  if (shownCount > 0) return "none";
  if (!filtered) return "empty";
  return liveCount > 0 ? "filtered" : "unsure";
}
