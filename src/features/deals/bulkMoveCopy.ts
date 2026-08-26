// Confirmation copy for a bulk stage move. The count and destination are stated because the
// selection lives in a toolbar the dialog covers, and there is no undo: reversing the move is a
// second bulk move.
export const BULK_MOVE_DESCRIPTION =
  "The stage changes for everyone on the team. There is no undo, so moving them back is another bulk move.";

export function bulkMoveTitle(count: number, stageName: string): string {
  const unit = count === 1 ? "deal" : "deals";
  return `Move ${count} ${unit} to ${stageName}?`;
}
