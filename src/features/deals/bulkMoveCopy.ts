export const BULK_MOVE_DESCRIPTION =
  "The stage changes for everyone on the team. There is no undo, so moving them back is another bulk move.";

export function bulkMoveTitle(count: number, stageName: string): string {
  const unit = count === 1 ? "deal" : "deals";
  return `Move ${count} ${unit} to ${stageName}?`;
}
