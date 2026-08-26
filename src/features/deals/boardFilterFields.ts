// Which deal fields the pipeline board's filter builder offers, projected from the one catalog both
// deal builders render (dealFilterCatalog). Kept as pure data (no "use client") so the finder #4
// invariant test can assert, against seeded data, that every field offered here returns board
// results. "status" is excluded there, not here; see the note in dealFilterCatalog.ts.
import type { FILTER_FIELDS } from "@/features/saved-filters/schemas";
import { dealFilterFields } from "./dealFilterCatalog";

type AstField = (typeof FILTER_FIELDS)[number];

export interface OfferedFilterField {
  value: AstField;
  label: string;
}

export const OFFERED_BOARD_FILTER_FIELDS: OfferedFilterField[] = dealFilterFields().map((f) => ({
  value: f.field,
  label: f.label,
}));
