import {
  type EntityCreateState,
  initialEntityCreateState,
} from "@/features/entity-create/modalState";

export type AddLeadState = Omit<EntityCreateState, "label"> & {
  labels: string[];
  leadCustomFields: Record<string, unknown>;
};

export function initialAddLeadState(): AddLeadState {
  return { ...initialEntityCreateState(), labels: [], leadCustomFields: {} };
}
