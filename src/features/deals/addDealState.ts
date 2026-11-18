import {
  type EntityCreateState,
  initialEntityCreateState,
} from "@/features/entity-create/modalState";

export interface AddDealState extends EntityCreateState {
  pipelineId: string;
  stageId: string;
  dealCustomFields: Record<string, unknown>;
}

export function initialAddDealState(pipelineId: string, stageId: string): AddDealState {
  return { ...initialEntityCreateState(), pipelineId, stageId, dealCustomFields: {} };
}
