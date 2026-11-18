import { wsChannel } from "./wsChannels";

export const dealMovedChannel = (pipelineId: string): string => wsChannel.pipeline(pipelineId);
export const dealChannel = (dealId: string): string => wsChannel.deal(dealId);

export const BOARD_EVENT = {
  dealMoved: "deal_moved",
  dealCreated: "deal_created",
  dealUpdated: "deal_updated",
} as const;
