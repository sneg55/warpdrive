export const BOARD_EMPTY_FILTERED_TITLE = "No deals match these filters";
export const BOARD_EMPTY_FILTERED_BODY =
  "The board is showing a subset. Clear the filters to see the whole pipeline again.";
export const BOARD_CLEAR_FILTERS = "Clear filters";

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
