// Why the board is showing nothing. These are different sentences with different exits, and
// getting it wrong tells someone to clear filters that were hiding nothing.
//
// "filtered" is only claimed when it can be proved. The owner picker narrows on the client, so
// cards the server returned but the board is not showing are that proof. A saved filter or ad-hoc
// conditions narrow server-side, so a zero result there could equally mean an empty pipeline, and
// the board says so without blaming anything: "unsure".
export type BoardEmptyKind = "none" | "filtered" | "unsure" | "empty";

export interface BoardEmptyInput {
  // Cards on screen, after the client-side owner narrowing.
  shownCount: number;
  // Cards the server returned, so already narrowed by any saved filter or ad-hoc conditions.
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
