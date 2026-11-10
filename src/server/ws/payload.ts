import { z } from "zod";
import { err, ok, type Result } from "@/types/result";

const MAX_NOTIFY_BYTES = 8000;

const envelope = z.object({
  v: z.literal(1),
  channel: z.string().min(3),
  ts: z.string().datetime(),
  actorId: z.string().nullable().default(null),
});

const event = z.discriminatedUnion("type", [
  envelope.extend({
    type: z.literal("email_thread_updated"),
    data: z.object({ threadId: z.string(), accountId: z.string() }),
  }),
  envelope.extend({
    type: z.literal("deal_moved"),
    data: z.object({
      dealId: z.string(),
      fromStageId: z.string().optional(),
      toStageId: z.string().optional(),
      boardPosition: z.string().optional(),
    }),
  }),
  envelope.extend({
    type: z.literal("deal_created"),
    data: z.object({
      dealId: z.string(),
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
    }),
  }),
  envelope.extend({
    type: z.literal("deal_updated"),
    data: z.object({
      dealId: z.string(),
      pipelineId: z.string().optional(),
    }),
  }),
  envelope.extend({
    type: z.literal("note_added"),
    data: z.object({ noteId: z.string(), dealId: z.string() }),
  }),
  envelope.extend({
    type: z.literal("mention"),
    data: z.object({
      notificationId: z.string(),
      sourceType: z.string(),
      sourceId: z.string(),
    }),
  }),
  envelope.extend({
    type: z.literal("notification"),
    data: z.object({ notificationId: z.string(), kind: z.string() }),
  }),
  envelope.extend({
    type: z.literal("email_arrived"),
    data: z.object({
      messageId: z.string(),
      threadId: z.string(),
      accountId: z.string(),
    }),
  }),
  envelope.extend({
    type: z.literal("email_tracking"),
    data: z.object({
      sendAttemptId: z.string(),
      kind: z.enum(["open", "click"]),
    }),
  }),
  envelope.extend({
    type: z.literal("import_progress"),
    data: z.object({
      batchId: z.string(),
      phase: z.enum(["prepare", "validate", "commit", "undo"]),
      processed: z.number().int(),
      total: z.number().int(),
      status: z.string(),
    }),
  }),
]);

export type PublishedEvent = z.infer<typeof event>;
export type ClientEvent = PublishedEvent & { seq: number };
export type NotifyEvent = PublishedEvent;

export function parseNotifyPayload(raw: unknown): Result<PublishedEvent, "invalid"> {
  if (Buffer.byteLength(JSON.stringify(raw)) > MAX_NOTIFY_BYTES) return err("invalid");
  const parsed = event.safeParse(raw);
  if (!parsed.success) return err("invalid");
  return ok(parsed.data);
}
