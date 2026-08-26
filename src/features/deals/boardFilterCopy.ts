// Copy for the board's applied-filter chips and its three empty states. The board owns its wording
// here rather than in the shared STRINGS module, matching bulkMoveCopy.

// A filter that excluded every card is a different sentence from a pipeline with nothing in it:
// one is hiding deals and can be undone, the other is waiting for a first deal.
export const BOARD_EMPTY_FILTERED_TITLE = "No deals match these filters";
export const BOARD_EMPTY_FILTERED_BODY =
  "The board is showing a subset. Clear the filters to see the whole pipeline again.";
export const BOARD_CLEAR_FILTERS = "Clear filters";

// Filters are applied and the server returned nothing, which looks identical whether the filters
// excluded everything or the pipeline is empty. Neither is asserted, and both exits are offered.
export const BOARD_EMPTY_UNSURE_TITLE = "Nothing to show here";
export const BOARD_EMPTY_UNSURE_BODY =
  "This pipeline has filters applied. Clear them to see everything in it, or add a deal.";

export const BOARD_EMPTY_TITLE = "No deals in this pipeline yet";
export const BOARD_EMPTY_BODY =
  "A deal is one opportunity: a value, a stage and an owner. Add the first one and it lands in a stage column below.";

export const BOARD_CHIPS_LABEL = "Applied filters";
export const BOARD_CLEAR_ALL = "Clear all";

export function ownerChipLabel(name: string): string {
  return `Owner: ${name}`;
}

export function savedFilterChipLabel(name: string): string {
  return `Filter: ${name}`;
}

export function conditionChipLabel(count: number): string {
  return `${count} ${count === 1 ? "condition" : "conditions"}`;
}
