import { randomBytes } from "node:crypto";

// Message-ID parts are SERVER-DERIVED. Strip anything not valid in the local part of
// a Message-ID so a malicious idempotencyKey cannot inject CR/LF, spaces, or angle
// brackets. The result is deterministic for the same inputs (Task 13 reconciliation
// matches on it). The domain is server config, not client text, so it passes through.
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

// Header-injection defense: collapse any CR/LF (and lone CR/LF) so an attacker cannot
// terminate a header and inject a new one. Applied to every header VALUE built from
// caller-supplied text (from/to/cc/subject). We strip rather than fold, since these
// are single-line address/subject values.
function sanitizeHeaderValue(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

// RFC 2183 quoted-string escaping for Content-Disposition filename parameters.
// Processes the string char-by-char (no regex) to sidestep Biome's
// noControlCharactersInRegex rule:
//   - control characters (U+0000-U+001F, U+007F) are stripped
//   - backslash and double-quote are backslash-escaped per RFC 2183 section 2
function escapeDispositionFilename(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] ?? "";
    const code = ch.charCodeAt(0);
    // Strip control characters (NUL, CR, LF, DEL, etc.).
    if (code <= 31 || code === 127) continue;
    // Backslash-escape the two characters that would break the quoted-string.
    if (ch === "\\" || ch === '"') out += "\\";
    out += ch;
  }
  return out;
}

// True when the string is pure ASCII (no byte >= 128).
function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 127) return false;
  }
  return true;
}

// RFC 2047 encoded-word for a non-ASCII header value: =?UTF-8?B?<base64>?=. We always
// use Base64 (B) encoding for simplicity and correctness over Q. The value is sanitized
// first so control chars never reach the encoder. ASCII values pass through unchanged.
function encodeHeaderWord(value: string): string {
  const clean = sanitizeHeaderValue(value);
  if (isAscii(clean)) return clean;
  const b64 = Buffer.from(clean, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

// A boundary that cannot collide with body content: random bytes, no base64 specials
// that could appear naturally, wrapped in a fixed prefix/suffix.
function makeBoundary(): string {
  return `=_wd_${randomBytes(18).toString("hex")}_=`;
}

export interface MimeAttachment {
  filename: string;
  contentType: string;
  // Raw bytes of the attachment; base64-encoded into the MIME part.
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
  // Phase 6: when present, wraps the message in multipart/mixed with one part per file.
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
    // messageId/inReplyTo/references are server-derived ids; sanitize defensively anyway.
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

  // Build the body part (text/html or multipart/alternative). When attachments are
  // present this becomes the first child of a multipart/mixed wrapper.
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
    // No attachments: emit the body part directly (zero behavioural change for existing sends).
    lines.push(...bodyPart);
  } else {
    // Wrap in multipart/mixed: body part first, then one part per attachment.
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

// Gmail `raw` format: URL-safe base64 (base64url) of the full MIME message.
export function toRawBase64(mime: string): string {
  return Buffer.from(mime, "utf8").toString("base64url");
}
