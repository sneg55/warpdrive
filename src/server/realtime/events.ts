import { z } from "zod";
import { BOARD_EVENT } from "@/constants/boardChannels";
import { publishEvent } from "@/server/notify";
import type { PublishedEvent } from "@/server/ws/payload";
import type { DbOrTx } from "./channelVersions";

// Board event data: IDs only (ops spec A3, payload < 8000 bytes).
const boardDataSchema = z.object({
  dealId: z.string(),
  fromStageId: z.string().optional(),
  toStageId: z.string().optional(),
  // Serialized as string to preserve exact decimal representation.
  boardPosition: z.string().optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
});

// Canonical board-event schema (no seq: the WS server stamps seq per socket).
// Single source of truth for what publishBoardEvent produces and callers validate.
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

// Validates the board envelope and DELEGATES to publishEvent, the single publish
// path (bump + pg_notify in the same tx). A rolled-back tx publishes nothing
// (ops spec A4). No seq is set here: the WS server stamps a per-socket seq at send
// time. Payload stays < 8000 bytes because data carries IDs only.
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

  // board is a PublishedEvent subtype (board's data is a superset of the union's
  // per-type data; the discriminant `type` selects the right variant on parse).
  await publishEvent(tx, board satisfies PublishedEvent, signal);
}
