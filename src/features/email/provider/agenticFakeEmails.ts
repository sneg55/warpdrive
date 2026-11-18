import type { IncomingMessage, ServerResponse } from "node:http";
import { AGENTIC_FOLDER } from "@/constants/email";
import type { ChangeEmail } from "./agenticSchemas";

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

export function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

export function buildEmail(
  seq: number,
  partial: Partial<ChangeEmail> & { id: string },
): ChangeEmail {
  return {
    folder: "inbox",
    thread_id: `thread-${partial.id}`,
    message_id: `${partial.id}@fake`,
    in_reply_to: null,
    email_references: null,
    sender: "sender@example.com",
    recipient: "me@example.com",
    cc: null,
    bcc: null,
    subject: "Subject",
    date: "2026-01-01T00:00:00.000Z",
    body: "<p>body</p>",
    raw_headers: null,
    attachments: [],
    ...partial,
    seq,
  };
}

export function forkSingleEmail(email: ChangeEmail): Record<string, unknown> {
  const { folder, attachments, ...row } = email;
  return {
    id: row.id,
    folder_id: folder,
    subject: row.subject,
    sender: row.sender,
    recipient: row.recipient,
    cc: row.cc,
    bcc: row.bcc,
    date: row.date,
    read: folder === AGENTIC_FOLDER.sent,
    starred: false,
    body: row.body,
    in_reply_to: row.in_reply_to,
    email_references: row.email_references,
    thread_id: row.thread_id,
    message_id: row.message_id,
    raw_headers: row.raw_headers,
    send_state: folder === AGENTIC_FOLDER.sent ? "sent" : null,
    client_ref: null,
    seq: row.seq,
    attachments: attachments.map((a) => ({ ...a, email_id: row.id })),
  };
}

export type FakeSendBehavior =
  | { kind: "ok" }
  | { kind: "limit"; retryAfter: number | null }
  | { kind: "temporary"; code: string }
  | { kind: "permanent"; code: string }
  | { kind: "unknown" }
  | { kind: "bad_request" }
  | { kind: "not_found" }
  | { kind: "server_error"; status: number };

export function refuseSend(res: ServerResponse, b: Exclude<FakeSendBehavior, { kind: "ok" }>) {
  switch (b.kind) {
    case "limit":
      return json(
        res,
        429,
        { error: "limit", code: "E_SENDING_LIMIT" },
        b.retryAfter === null ? {} : { "Retry-After": String(b.retryAfter) },
      );
    case "temporary":
      return json(res, 503, { error: "temporary", code: b.code });
    case "permanent":
      return json(res, 422, { error: "rejected", code: b.code });
    case "unknown":
      return json(res, 409, { error: "send outcome unknown" });
    case "bad_request":
      return json(res, 400, { error: "sender mismatch" });
    case "not_found":
      return json(res, 404, { error: "original not found" });
    case "server_error":
      return json(res, b.status, { error: "server error" });
  }
}
