import {
  type EntityCreateState,
  initialEntityCreateState,
} from "@/features/entity-create/modalState";

// All editable state for the Add deal dialog: the shared create fields plus the deal-only
// pipeline/stage. The orchestrator holds this single source of truth and hands the columns a patch
// updater.
export interface AddDealState extends EntityCreateState {
  pipelineId: string;
  stageId: string;
  dealCustomFields: Record<string, unknown>;
}

export function initialAddDealState(pipelineId: string, stageId: string): AddDealState {
  return { ...initialEntityCreateState(), pipelineId, stageId, dealCustomFields: {} };
}
