// Single source of truth for which deal fields the pipeline board's filter builder offers.
// Kept as pure data (no "use client") so the finder #4 invariant test can assert, against seeded
// data, that every field offered here actually returns board results. The filter row UI
// (CreateFilterRows) renders exactly this list.
//
// "status" is intentionally NOT offered: the board query hardcodes status = 'open', so any status
// condition other than open ANDs to an impossible predicate and returns zero deals. Offering it
// would only produce empty, confusing results. (Owner/Title/Value are the useful board fields.)
import type { FILTER_FIELDS } from "@/features/saved-filters/schemas";

type AstField = (typeof FILTER_FIELDS)[number];

export interface OfferedFilterField {
  value: AstField;
  label: string;
}

export const OFFERED_BOARD_FILTER_FIELDS: OfferedFilterField[] = [
  { value: "title", label: "Title" },
  { value: "orgName", label: "Organization" },
  { value: "value", label: "Value" },
  { value: "ownerId", label: "Owner" },
];
