import type { FilterOpKey } from "@/constants/filterOps";
import type { ConditionCombinator, ConditionValue } from "@/schemas/filterCondition";

export interface SavedViewDefinition {
  combinator: ConditionCombinator;
  conditions: Array<{ field: string; op: FilterOpKey; value?: ConditionValue }>;
}

export interface SavedView {
  id: string;
  name: string;
  favorite: boolean;
  isShared: boolean;
  isOwn: boolean;
  definition: SavedViewDefinition;
}
