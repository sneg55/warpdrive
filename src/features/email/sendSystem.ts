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
  idempotencyKey?: string;
}

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
