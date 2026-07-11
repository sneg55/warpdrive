// Realtime channel names and board event type strings. No magic strings elsewhere.
// Delegates to wsChannel builders so channel-name format stays in one place.
import { wsChannel } from "./wsChannels";

export const dealMovedChannel = (pipelineId: string): string => wsChannel.pipeline(pipelineId);
export const dealChannel = (dealId: string): string => wsChannel.deal(dealId);

export const BOARD_EVENT = {
  dealMoved: "deal_moved",
  dealCreated: "deal_created",
  dealUpdated: "deal_updated",
} as const;

export type BoardEventType = (typeof BOARD_EVENT)[keyof typeof BOARD_EVENT];
