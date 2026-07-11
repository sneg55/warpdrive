import { extractAttachments, type ParsedAttachment } from "./attachmentParse";
import type { GmailMessage } from "./gmailSchemas";

export interface ParsedGmailMessage {
  gmailMessageId: string;
  threadId: string;
  fromEmail: string;
  // Display name from the From header ("Scrape.do Team" in `"Scrape.do Team" <support@scrape.do>`),
  // null when the From is a bare address. Used to show the sender name in the inbox list + reader.
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
}

type GmailPart = NonNullable<GmailMessage["payload"]>;

// Parse one RFC 5322 mailbox ("Name <email>", "<email>", or bare "email") into its display
// name and bare address. The address is what we match contacts on and fall back to for display;
// the name is what the list/reader shows. Bodies of the header are trimmed; a quoted name is
// unquoted. No angle brackets means the whole value is the address (name null).
export function parseAddress(raw: string): { name: string | null; email: string } {
  const value = raw.trim();
  const open = value.lastIndexOf("<");
  const close = value.lastIndexOf(">");
  if (open !== -1 && close > open) {
    const email = value.slice(open + 1, close).trim();
    let namePart = value.slice(0, open).trim();
    // Unwrap a quoted-string display name and RFC 5322-unescape its contents ("John \"JD\" Doe"
    // -> John "JD" Doe) so the shown name has no stray backslashes or quotes.
    if (namePart.startsWith('"') && namePart.endsWith('"') && namePart.length >= 2) {
      namePart = namePart.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    namePart = namePart.trim();
    return { name: namePart.length > 0 ? namePart : null, email };
  }
  return { name: null, email: value };
}

// Split an RFC 5322 address-list header on the commas that separate mailboxes, NOT the commas
// inside a quoted display name ("Doe, John" <j@x.com>). A naive split(",") tears that name apart
// and yields a junk participant. Only commas outside double-quotes are separators.
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

// Split an address-list header ("a@x.com, b@y.com") into trimmed, non-empty BARE addresses,
// dropping any display names so participant matching compares plain addresses.
function splitAddresses(value: string | undefined): string[] {
  if (value === undefined) return [];
  return splitAddressList(value)
    .map((a) => parseAddress(a).email)
    .filter((a) => a.length > 0);
}

// Case-insensitive header lookup; Gmail header names are not normalized.
function header(headers: GmailPart["headers"], name: string): string | undefined {
  if (headers === undefined) return undefined;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lower) return h.value;
  }
  return undefined;
}

// Decode a base64url part body. Returns null for an absent body.
function decodeBody(part: GmailPart): string | null {
  const data = part.body?.data;
  if (data === undefined) return null;
  return Buffer.from(data, "base64url").toString("utf8");
}

interface Bodies {
  html: string | null;
  text: string | null;
}

// Walk the MIME tree depth-first, capturing the first text/html and text/plain
// bodies. A part with no explicit mimeType but a body is treated as text.
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

// Decode a Gmail message into the structured shape the sync layer stores. Guards
// every optional/indexed field (noUncheckedIndexedAccess). Bodies are stored raw;
// sanitization happens at render time, not here.
export function parseGmailMessage(msg: GmailMessage): ParsedGmailMessage {
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
