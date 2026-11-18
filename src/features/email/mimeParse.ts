import type { EMAIL_MESSAGE_DIRECTION } from "@/constants/email";
import { extractAttachments, type ParsedAttachment } from "./attachmentParse";
import type { GmailMessage } from "./gmailSchemas";

export interface ParsedMessage {
  gmailMessageId: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  snippet: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  sentAt: Date | null;
  participants: string[];
  attachments: ParsedAttachment[];
  direction?: (typeof EMAIL_MESSAGE_DIRECTION)[number];
}

type GmailPart = NonNullable<GmailMessage["payload"]>;

export function parseAddress(raw: string): { name: string | null; email: string } {
  const value = raw.trim();
  const open = value.lastIndexOf("<");
  const close = value.lastIndexOf(">");
  if (open !== -1 && close > open) {
    const email = value.slice(open + 1, close).trim();
    let namePart = value.slice(0, open).trim();
    if (namePart.startsWith('"') && namePart.endsWith('"') && namePart.length >= 2) {
      namePart = namePart.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    namePart = namePart.trim();
    return { name: namePart.length > 0 ? namePart : null, email };
  }
  return { name: null, email: value };
}

function splitAddressList(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

export function splitAddresses(value: string | undefined): string[] {
  if (value === undefined) return [];
  return splitAddressList(value)
    .map((a) => parseAddress(a).email)
    .filter((a) => a.length > 0);
}

function header(headers: GmailPart["headers"], name: string): string | undefined {
  if (headers === undefined) return undefined;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lower) return h.value;
  }
  return undefined;
}

function decodeBody(part: GmailPart): string | null {
  const data = part.body?.data;
  if (data === undefined) return null;
  return Buffer.from(data, "base64url").toString("utf8");
}

interface Bodies {
  html: string | null;
  text: string | null;
}

function collectBodies(part: GmailPart, acc: Bodies): void {
  const mime = part.mimeType ?? "";
  if (mime === "text/html" && acc.html === null) {
    acc.html = decodeBody(part);
  } else if (mime === "text/plain" && acc.text === null) {
    acc.text = decodeBody(part);
  } else if (mime === "" && acc.text === null && acc.html === null) {
    acc.text = decodeBody(part);
  }
  if (part.parts !== undefined) {
    for (const child of part.parts) {
      collectBodies(child, acc);
    }
  }
}

export function parseGmailMessage(msg: GmailMessage): ParsedMessage {
  const payload = msg.payload;
  const headers = payload?.headers;

  const from = parseAddress(header(headers, "From") ?? "");
  const fromEmail = from.email;
  const fromName = from.name;
  const toEmails = splitAddresses(header(headers, "To"));
  const ccEmails = splitAddresses(header(headers, "Cc"));
  const subject = header(headers, "Subject") ?? null;

  const bodies: Bodies = { html: null, text: null };
  if (payload !== undefined) collectBodies(payload, bodies);

  const dateHeader = header(headers, "Date");
  let sentAt: Date | null = null;
  if (dateHeader !== undefined) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) sentAt = parsed;
  } else if (msg.internalDate !== undefined) {
    const ms = Number(msg.internalDate);
    if (!Number.isNaN(ms)) sentAt = new Date(ms);
  }

  const participants = [fromEmail, ...toEmails, ...ccEmails].filter((a) => a.length > 0);

  return {
    gmailMessageId: msg.id,
    threadId: msg.threadId,
    fromEmail,
    fromName,
    toEmails,
    ccEmails,
    subject,
    snippet: msg.snippet ?? null,
    bodyHtml: bodies.html,
    bodyText: bodies.text,
    sentAt,
    participants,
    attachments: extractAttachments(payload),
  };
}
