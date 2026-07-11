import { z } from "zod";

const messageRefSchema = z.object({ id: z.string(), threadId: z.string() });

export const historyListSchema = z.object({
  historyId: z.string(),
  nextPageToken: z.string().optional(),
  history: z
    .array(
      z.object({
        messagesAdded: z.array(z.object({ message: messageRefSchema })).optional(),
        messagesDeleted: z.array(z.object({ message: messageRefSchema })).optional(),
        // labelIds carries WHICH labels changed; needed to detect a Gmail-side TRASH add (delete)
        // and TRASH removal (restore) (P4), which arrive as label changes on an existing message,
        // not messagesAdded events.
        labelsAdded: z
          .array(z.object({ message: messageRefSchema, labelIds: z.array(z.string()).default([]) }))
          .optional(),
        labelsRemoved: z
          .array(z.object({ message: messageRefSchema, labelIds: z.array(z.string()).default([]) }))
          .optional(),
      }),
    )
    .default([]),
});
export type HistoryList = z.infer<typeof historyListSchema>;

const headerSchema = z.object({ name: z.string(), value: z.string() });

// GmailPart is recursive so we need an explicit type + z.lazy.
export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

const partSchema: z.ZodType<GmailPart> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(headerSchema).optional(),
    body: z
      .object({
        data: z.string().optional(),
        attachmentId: z.string().optional(),
        size: z.number().optional(),
      })
      .optional(),
    parts: z.array(partSchema).optional(),
  }),
);

export const gmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  snippet: z.string().optional(),
  internalDate: z.string().optional(),
  labelIds: z.array(z.string()).default([]),
  payload: partSchema.optional(),
});
export type GmailMessage = z.infer<typeof gmailMessageSchema>;

export const sendResultSchema = z.object({ id: z.string(), threadId: z.string() });
export type SendResult = z.infer<typeof sendResultSchema>;

export const messageListSchema = z.object({
  messages: z.array(messageRefSchema).default([]),
  resultSizeEstimate: z.number().optional(),
  nextPageToken: z.string().optional(),
});
export type MessageList = z.infer<typeof messageListSchema>;

export const gmailThreadSchema = z.object({
  id: z.string(),
  // Per-message labelIds (format=metadata returns them). Used to tell a WHOLE-thread trash from a
  // single-message trash (P4): a thread is trashed in WD only when every message is in TRASH.
  messages: z
    .array(z.object({ id: z.string(), labelIds: z.array(z.string()).default([]) }))
    .default([]),
});
export type GmailThread = z.infer<typeof gmailThreadSchema>;

export const gmailProfileSchema = z.object({
  historyId: z.string(),
  emailAddress: z.string().optional(),
  messagesTotal: z.number().optional(),
  threadsTotal: z.number().optional(),
});
export type GmailProfile = z.infer<typeof gmailProfileSchema>;

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

// Pub/Sub push: base64 JSON { emailAddress, historyId } inside message.data.
// The transform decodes and re-parses so callers get a flat, typed object.
export const pushPayloadSchema = z
  .object({ message: z.object({ data: z.string() }), subscription: z.string() })
  .transform(
    (env) => JSON.parse(Buffer.from(env.message.data, "base64").toString("utf8")) as unknown,
  )
  .pipe(
    z.object({
      emailAddress: z.string().email(),
      historyId: z.union([z.string(), z.number()]).transform(String),
    }),
  );
export type PushPayload = z.infer<typeof pushPayloadSchema>;
