import { randomUUID } from "node:crypto";
import { env } from "@/config/env";
import type { AppError } from "@/constants/errorIds";
import { db } from "@/db/client";
import type { EmailAccountRow } from "@/types/email";
import { ok, type Result } from "@/types/result";
import { createGmailClient, type GmailClient } from "./gmailClient";
import { makeRefresh } from "./gmailRefresh";
import { buildMime, deriveMessageId, toRawBase64 } from "./mime";
import { ensureAccessToken } from "./tokens";

export interface SystemSendDeps {
  resolveClient: (
    account: EmailAccountRow,
    signal: AbortSignal,
  ) => Promise<Result<GmailClient, AppError>>;
}

export interface SystemMessage {
  to: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  threadId?: string;
  // Optional caller-supplied idempotency key. When set, the derived Message-ID is stable
  // across retries so an at-least-once re-send reuses the same RFC822 Message-ID (F36).
  idempotencyKey?: string;
}

// Default dependency: resolve a fresh access token (ops B2) then build the real Gmail
// client. This is the ONE justified production-db import: it is the default dep for a
// fire-and-forget system primitive. The DI seam (deps.resolveClient) keeps tests fully
// db-free (they inject a fake client and never reach this path).
async function defaultResolveClient(
  account: EmailAccountRow,
  signal: AbortSignal,
): Promise<Result<GmailClient, AppError>> {
  signal.throwIfAborted();
  const token = await ensureAccessToken(db, {
    accountId: account.id,
    deps: { refresh: makeRefresh(signal) },
  });
  if (!token.ok) return token;
  return ok(createGmailClient(token.value.token));
}

// System-send primitive: no outbox, no tracking, no interactive ownership check.
// Callers (e.g. Phase 5 notification jobs) own their own idempotency. System mail has
// no client idempotency key, so the deterministic Message-ID is derived from the
// account id plus a fresh random key.
export async function sendGmail(
  account: EmailAccountRow,
  message: SystemMessage,
  signal: AbortSignal,
  deps: SystemSendDeps = { resolveClient: defaultResolveClient },
): Promise<Result<{ gmailMessageId: string }, AppError>> {
  signal.throwIfAborted();
  const client = await deps.resolveClient(account, signal);
  if (!client.ok) return client;

  const messageId = deriveMessageId({
    accountId: account.id,
    idempotencyKey: message.idempotencyKey ?? randomUUID(),
    domain: env.GOOGLE_WORKSPACE_DOMAIN,
  });
  const mime = buildMime({
    from: account.emailAddress,
    to: message.to,
    subject: message.subject,
    html: message.bodyHtml,
    text: message.bodyText,
    messageId,
  });
  const sent = await client.value.sendRaw({
    rawBase64: toRawBase64(mime),
    threadId: message.threadId,
    signal,
  });
  signal.throwIfAborted();
  if (!sent.ok) return sent;
  return ok({ gmailMessageId: sent.value.id });
}
