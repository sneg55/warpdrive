import { z } from "zod";
import { AGENTIC_FOLDER } from "@/constants/email";
import { type ParsedMessage, parseAddress, splitAddresses } from "../mimeParse";
import { bodySnippet } from "../snippetText";
import type { ChangeEmail } from "./agenticSchemas";

const rawHeadersSchema = z.array(z.object({ key: z.string(), value: z.string() }));
const HTML_TAG = /<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\/?>/i;

function rawHeader(raw: string | null, name: string): string | undefined {
  if (raw === null) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = rawHeadersSchema.safeParse(json);
  if (!parsed.success) return undefined;
  return parsed.data.find((h) => h.key.toLowerCase() === name)?.value;
}

function sentAt(date: string | null): Date | null {
  if (date === null) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function agenticThreadId(e: Pick<ChangeEmail, "id" | "thread_id">): string {
  return e.thread_id ?? e.id;
}

export function agenticParse(e: ChangeEmail, mailbox: string): ParsedMessage {
  const isSent = e.folder === AGENTIC_FOLDER.sent;
  const sender = parseAddress(e.sender ?? "").email;
  const fromEmail = sender === "" && isSent ? mailbox : sender;
  const headerFrom = rawHeader(e.raw_headers, "from");
  const fromName = headerFrom === undefined ? null : parseAddress(headerFrom).name;
  const toEmails = splitAddresses(e.recipient ?? undefined);
  const ccEmails = splitAddresses(e.cc ?? undefined);
  const isHtml = e.body !== null && HTML_TAG.test(e.body);
  return {
    gmailMessageId: e.id,
    threadId: agenticThreadId(e),
    fromEmail,
    fromName,
    toEmails,
    ccEmails,
    subject: e.subject,
    snippet: bodySnippet(e.body),
    bodyHtml: isHtml ? e.body : null,
    bodyText: isHtml ? null : e.body,
    sentAt: sentAt(e.date),
    participants: [fromEmail, ...toEmails, ...ccEmails].filter((a) => a.length > 0),
    direction: isSent ? "outbound" : "inbound",
    attachments: e.attachments
      .filter((a) => a.filename !== "")
      .map((a) => ({
        filename: a.filename,
        mimeType: a.mimetype,
        sizeBytes: a.size,
        gmailAttachmentId: a.id,
      })),
  };
}
