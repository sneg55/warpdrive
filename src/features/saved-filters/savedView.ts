// Client-side view of a saved_filters row, for every entity that has a list filter. Zod-free: the
// jsonb definition is parsed server-side (savedFilters.listByTarget), so a list client never ships
// zod to read its own views.
import type { FilterOpKey } from "@/constants/filterOps";
import type { ConditionCombinator, ConditionValue } from "@/schemas/filterCondition";

// The entity-agnostic shape every parsed saved view definition has. Each entity's own definition
// type (ContactFilterDefinition, LeadConditionInput) is assignable to it, so a view applies to its
// list without a cast.
export interface SavedViewDefinition {
  combinator: ConditionCombinator;
  conditions: Array<{ field: string; op: FilterOpKey; value?: ConditionValue }>;
}

export interface SavedView {
  id: string;
  name: string;
  favorite: boolean;
  isShared: boolean;
  // True when the session user owns this view. Only owners can toggle its favorite flag (the flag
  // is a per-row, owner-scoped column), so the UI hides the star on others' shared views.
  isOwn: boolean;
  definition: SavedViewDefinition;
}
