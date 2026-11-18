import { randomBytes } from "node:crypto";

function sanitizeIdPart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "");
}

export function deriveMessageId(args: {
  accountId: string;
  idempotencyKey: string;
  domain: string;
}): string {
  const acc = sanitizeIdPart(args.accountId);
  const key = sanitizeIdPart(args.idempotencyKey);
  return `<${acc}.${key}@${args.domain}>`;
}

function sanitizeHeaderValue(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

function escapeDispositionFilename(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] ?? "";
    const code = ch.charCodeAt(0);
    if (code <= 31 || code === 127) continue;
    if (ch === "\\" || ch === '"') out += "\\";
    out += ch;
  }
  return out;
}

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 127) return false;
  }
  return true;
}

function encodeHeaderWord(value: string): string {
  const clean = sanitizeHeaderValue(value);
  if (isAscii(clean)) return clean;
  const b64 = Buffer.from(clean, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function makeBoundary(): string {
  return `=_wd_${randomBytes(18).toString("hex")}_=`;
}

export interface MimeAttachment {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export function buildMime(args: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  attachments?: MimeAttachment[];
}): string {
  const to = args.to.map(sanitizeHeaderValue).join(", ");
  const cc = (args.cc ?? []).map(sanitizeHeaderValue).join(", ");
  const bcc = (args.bcc ?? []).map(sanitizeHeaderValue).join(", ");

  const headers: string[] = [`From: ${sanitizeHeaderValue(args.from)}`, `To: ${to}`];
  if (cc.length > 0) headers.push(`Cc: ${cc}`);
  if (bcc.length > 0) headers.push(`Bcc: ${bcc}`);
  headers.push(
    `Subject: ${encodeHeaderWord(args.subject)}`,
    `Message-ID: ${sanitizeHeaderValue(args.messageId)}`,
  );
  if (args.inReplyTo !== undefined) {
    headers.push(`In-Reply-To: ${sanitizeHeaderValue(args.inReplyTo)}`);
  }
  if (args.references !== undefined) {
    headers.push(`References: ${sanitizeHeaderValue(args.references)}`);
  }
  headers.push("MIME-Version: 1.0");

  const lines: string[] = [...headers];

  const bodyPart: string[] = [];
  if (args.text !== undefined) {
    const altBoundary = makeBoundary();
    bodyPart.push(
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(args.text, "utf8").toString("base64"),
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(args.html, "utf8").toString("base64"),
      `--${altBoundary}--`,
    );
  } else {
    bodyPart.push(
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(args.html, "utf8").toString("base64"),
    );
  }

  const attachments = args.attachments ?? [];
  if (attachments.length === 0) {
    lines.push(...bodyPart);
  } else {
    const mixedBoundary = makeBoundary();
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`, "");
    lines.push(`--${mixedBoundary}`);
    lines.push(...bodyPart);
    for (const att of attachments) {
      lines.push(
        `--${mixedBoundary}`,
        `Content-Type: ${sanitizeHeaderValue(att.contentType)}`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${escapeDispositionFilename(att.filename)}"`,
        "",
        att.bytes.toString("base64"),
      );
    }
    lines.push(`--${mixedBoundary}--`);
  }

  return lines.join("\r\n");
}

export function toRawBase64(mime: string): string {
  return Buffer.from(mime, "utf8").toString("base64url");
}
