import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { env } from "@/config/env";
import type { Db } from "@/db/client";
import { recordEvent } from "./trackingRecord";

export interface LinkToken {
  original: string;
  token: string;
}

export interface MintResult {
  openToken: string | null;
  linkTokens: LinkToken[];
}

// Unguessable opaque token: 18 random bytes -> base64url. The URL token is the only
// lookup key, so an attacker cannot enumerate rows.
function newToken(): string {
  return randomBytes(18).toString("base64url");
}

// Open-redirect guard: only http(s) links may ever be stored as a redirect target.
// A javascript:, data:, or other-scheme link is skipped at mint time so it can never
// become a click destination.
function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Mint tracking rows for a send (message_id NULL until backfillTokens runs after the
// send reconciles). trackOpens/trackLinks are independent: false mints nothing for that type.
export async function mintTokensForSend(
  db: Db,
  args: {
    sendAttemptId: string;
    recipient: string;
    links: string[];
    trackOpens: boolean;
    trackLinks: boolean;
    signal: AbortSignal;
  },
): Promise<MintResult> {
  args.signal.throwIfAborted();
  if (!args.trackOpens && !args.trackLinks) return { openToken: null, linkTokens: [] };

  let openToken: string | null = null;
  if (args.trackOpens) {
    openToken = newToken();
    await db.execute(sql`
      INSERT INTO email_tracking_tokens (token, send_attempt_id, recipient, kind, target_url)
      VALUES (${openToken}, ${args.sendAttemptId}, ${args.recipient}, 'open', NULL)
    `);
    args.signal.throwIfAborted();
  }

  const linkTokens: LinkToken[] = [];
  if (args.trackLinks) {
    for (const original of args.links) {
      if (!isSafeHttpUrl(original)) continue; // skip unsafe schemes
      const token = newToken();
      await db.execute(sql`
        INSERT INTO email_tracking_tokens (token, send_attempt_id, recipient, kind, target_url)
        VALUES (${token}, ${args.sendAttemptId}, ${args.recipient}, 'click', ${original})
      `);
      args.signal.throwIfAborted();
      linkTokens.push({ original, token });
    }
  }

  return { openToken, linkTokens };
}

// Pure: inject the open pixel and rewrite each known href to the click URL. No DB.
export function rewriteBody(args: {
  html: string;
  openToken: string | null;
  linkTokens: LinkToken[];
}): string {
  let out = args.html;
  for (const { original, token } of args.linkTokens) {
    const clickUrl = `${env.BASE_URL}/t/click/${token}`;
    // Replace the href value only (quoted), leaving the rest of the anchor intact.
    out = out.split(`href="${original}"`).join(`href="${clickUrl}"`);
    out = out.split(`href='${original}'`).join(`href='${clickUrl}'`);
  }
  if (args.openToken !== null) {
    const pixel = `<img width="1" height="1" alt="" src="${env.BASE_URL}/t/open/${args.openToken}">`;
    out = `${out}${pixel}`;
  }
  return out;
}

// Record an open (best-effort). The caller always returns the pixel.
export async function recordOpen(
  db: Db,
  token: string,
  userAgent: string | null,
  signal: AbortSignal,
): Promise<void> {
  await recordEvent(db, token, userAgent, "open", signal);
}

// Record a click (best-effort) and return the STORED target_url for the redirect.
// Never reads a destination from the request. Unknown token -> null.
export async function recordClick(
  db: Db,
  token: string,
  userAgent: string | null,
  signal: AbortSignal,
): Promise<string | null> {
  const row = await recordEvent(db, token, userAgent, "click", signal);
  return row?.target_url ?? null;
}

// After the send reconciles, attach the real message to every token for the attempt.
export async function backfillTokens(
  db: Db,
  args: { sendAttemptId: string; messageId: string; signal: AbortSignal },
): Promise<void> {
  await db.execute(sql`
    UPDATE email_tracking_tokens SET message_id=${args.messageId}
    WHERE send_attempt_id=${args.sendAttemptId} AND message_id IS NULL
  `);
  args.signal.throwIfAborted();
}

// Disable all tokens for an attempt: future hits record no event but still redirect.
export async function disableTokens(
  db: Db,
  sendAttemptId: string,
  signal: AbortSignal,
): Promise<void> {
  await db.execute(sql`
    UPDATE email_tracking_tokens SET disabled=true WHERE send_attempt_id=${sendAttemptId}
  `);
  signal.throwIfAborted();
}
