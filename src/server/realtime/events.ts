import { z } from "zod";
import { BOARD_EVENT } from "@/constants/boardChannels";
import { publishEvent } from "@/server/notify";
import type { PublishedEvent } from "@/server/ws/payload";
import type { DbOrTx } from "./channelVersions";

const boardDataSchema = z.object({
  dealId: z.string(),
  fromStageId: z.string().optional(),
  toStageId: z.string().optional(),
  boardPosition: z.string().optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
});

export const boardEventSchema = z.object({
  v: z.literal(1),
  type: z.enum([BOARD_EVENT.dealMoved, BOARD_EVENT.dealCreated, BOARD_EVENT.dealUpdated]),
  channel: z.string().min(1),
  ts: z.string(),
  actorId: z.string(),
  data: boardDataSchema,
});

export type BoardEvent = z.infer<typeof boardEventSchema>;

interface PublishArgs {
  channel: string;
  type: BoardEvent["type"];
  actorId: string;
  data: BoardEvent["data"];
}

export async function publishBoardEvent(
  tx: DbOrTx,
  args: PublishArgs,
  signal: AbortSignal,
): Promise<void> {
  const board = boardEventSchema.parse({
    v: 1,
    type: args.type,
    channel: args.channel,
    ts: new Date().toISOString(),
    actorId: args.actorId,
    data: args.data,
  });

  await publishEvent(tx, board satisfies PublishedEvent, signal);
}
