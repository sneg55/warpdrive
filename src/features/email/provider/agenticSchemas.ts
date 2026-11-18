import { z } from "zod";

export const changeAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimetype: z.string(),
  size: z.number(),
  content_id: z.string().nullable(),
  disposition: z.string().nullable(),
});

const rowFields = {
  id: z.string(),
  thread_id: z.string().nullable(),
  message_id: z.string().nullable(),
  in_reply_to: z.string().nullable(),
  email_references: z.string().nullable(),
  sender: z.string().nullable(),
  recipient: z.string().nullable(),
  cc: z.string().nullable(),
  bcc: z.string().nullable(),
  subject: z.string().nullable(),
  date: z.string().nullable(),
  body: z.string().nullable(),
  raw_headers: z.string().nullable(),
  attachments: z.array(changeAttachmentSchema),
};

const emailFields = { ...rowFields, folder: z.string() };

export const changeEmailSchema = z.object({ ...emailFields, seq: z.number().int() });

export const forkSingleEmailSchema = z
  .object({
    ...rowFields,
    folder_id: z.string(),
    read: z.boolean(),
    starred: z.boolean(),
    send_state: z.string().nullable(),
    client_ref: z.string().nullable(),
    seq: z.number().int().nullable(),
  })
  .transform(
    (row): ChangeEmail => ({
      id: row.id,
      folder: row.folder_id,
      seq: row.seq ?? 0,
      thread_id: row.thread_id,
      message_id: row.message_id,
      in_reply_to: row.in_reply_to,
      email_references: row.email_references,
      sender: row.sender,
      recipient: row.recipient,
      cc: row.cc,
      bcc: row.bcc,
      subject: row.subject,
      date: row.date,
      body: row.body,
      raw_headers: row.raw_headers,
      attachments: row.attachments,
    }),
  );

export const changesResponseSchema = z.object({
  emails: z.array(changeEmailSchema),
  cursor: z.number().int(),
});

export const headResponseSchema = z.object({ cursor: z.number().int() });
export const capabilitiesSchema = z.object({ warpdrive: z.number() });
export const mailboxSchema = z.object({}).passthrough();

export const sendOkSchema = z.object({
  id: z.string(),
  thread_id: z.string().nullable(),
  message_id: z.string(),
});
export const sendErrorSchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
});

export type ChangeEmail = z.infer<typeof changeEmailSchema>;
export type ChangeAttachment = z.infer<typeof changeAttachmentSchema>;
export type AgenticMailbox = z.infer<typeof mailboxSchema>;

export interface AgenticSendBody {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  client_ref?: string;
  thread_id?: string;
  in_reply_to?: string;
  references?: string[] | string;
  attachments?: unknown[];
}

export type AgenticSendResult =
  | { status: "sent"; id: string; thread_id: string | null; message_id: string }
  | { status: "retry_later"; reason: "limit" | "temporary"; retryAfterSeconds: number | null }
  | { status: "rejected"; code: string | null }
  | { status: "unknown" };
