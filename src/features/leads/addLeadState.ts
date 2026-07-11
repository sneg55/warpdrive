import {
  type EntityCreateState,
  initialEntityCreateState,
} from "@/features/entity-create/modalState";

// Editable state for the Add lead dialog. Shares the deal modal's fields (minus pipeline/stage) but
// carries multi-labels: the single `label` string is replaced by a `labels` key array.
export type AddLeadState = Omit<EntityCreateState, "label"> & { labels: string[] };

export function initialAddLeadState(): AddLeadState {
  return { ...initialEntityCreateState(), labels: [] };
}
