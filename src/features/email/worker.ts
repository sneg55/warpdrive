import { sql } from "drizzle-orm";
import { SYNC_JITTER_MODULO_SECONDS } from "@/constants/email";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { makeStorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import { createGmailClient, type GmailClient } from "./gmailClient";
import { makeRefresh } from "./gmailRefresh";
import { processSendAttempt } from "./outbox";
import { syncMailbox } from "./sync";
import { ensureAccessToken } from "./tokens";
import { performWorkerSendCrm } from "./workerSendCrm";

// Deterministic per-mailbox jitter (seconds) to spread sync starts and avoid a
// thundering herd. FNV-1a over the accountId bytes mod SYNC_JITTER_MODULO_SECONDS:
// stable for the same account, so re-enqueues land in the same window.
export function jitterFor(accountId: string): number {
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < accountId.length; i++) {
    hash ^= accountId.charCodeAt(i) & 0xff;
    // FNV prime 16777619, kept in 32-bit unsigned range via Math.imul + >>> 0.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % SYNC_JITTER_MODULO_SECONDS;
}

// Resolve a fresh Gmail client for an account (default dep). Injectable so tests pass a
// fake transport with no real OAuth. Never logs tokens.
export interface SyncDeps {
  resolveClient: (accountId: string, signal: AbortSignal) => Promise<Result<GmailClient, AppError>>;
}

async function defaultResolveClient(
  accountId: string,
  signal: AbortSignal,
): Promise<Result<GmailClient, AppError>> {
  signal.throwIfAborted();
  const token = await ensureAccessToken(prodDb, {
    accountId,
    deps: { refresh: makeRefresh(signal) },
  });
  if (!token.ok) return token;
  return ok(createGmailClient(token.value.token));
}

const defaultSyncDeps: SyncDeps = { resolveClient: defaultResolveClient };

// Per-job sync handler. Resolves a client, runs syncMailbox, and on ANY error stamps
// last_error_id and RETURNS the err (never throws raw, never logs tokens). The pg-boss
// handler converts a returned err into a sanitized throw for backoff.
export async function runSyncJob(
  db: Db,
  args: { accountId: string; signal: AbortSignal },
  deps: SyncDeps = defaultSyncDeps,
): Promise<Result<{ applied: number }, AppError>> {
  args.signal.throwIfAborted();
  const client = await deps.resolveClient(args.accountId, args.signal);
  if (!client.ok) return stampError(db, args.accountId, client.error, args.signal);

  const synced = await syncMailbox(db, {
    accountId: args.accountId,
    gmail: client.value,
    signal: args.signal,
  });
  if (!synced.ok) return stampError(db, args.accountId, synced.error, args.signal);
  return ok(synced.value);
}

// Per-job send handler. Resolves a client, processes one outbox attempt, and on success
// stores the CRM copy + backfills tracking tokens (matching the interactive send path in
// send.ts). Returns the Result; the pg-boss handler throws a sanitized AppError on !ok.
// makeStorageClient() is called here (production path) so attachment sends work end-to-end.
// Tests inject a fake via the deps pattern on processSendAttempt directly.
export async function runSendJob(
  db: Db,
  args: { accountId: string; idempotencyKey: string; signal: AbortSignal },
  deps: SyncDeps = defaultSyncDeps,
): Promise<Result<{ status: string }, AppError>> {
  args.signal.throwIfAborted();
  const client = await deps.resolveClient(args.accountId, args.signal);
  if (!client.ok) return client;

  const outcome = await processSendAttempt(db, {
    accountId: args.accountId,
    idempotencyKey: args.idempotencyKey,
    gmail: client.value,
    storage: makeStorageClient(),
    signal: args.signal,
  });
  if (!outcome.ok) return outcome;

  // Store the CRM copy and backfill tracking tokens for every worker-delivered send
  // (including scheduled sends promoted by the delayed pg-boss job). The interactive
  // path (send.ts runSend step g) does this inline; the worker path defers to here.
  // Idempotent: storeOutboundCopy upserts and backfillTokens is a no-op when already done.
  if (outcome.value.status === "sent" && outcome.value.gmailMessageId !== undefined) {
    const crm = await performWorkerSendCrm(db, {
      accountId: args.accountId,
      idempotencyKey: args.idempotencyKey,
      gmailMessageId: outcome.value.gmailMessageId,
      gmail: client.value,
      signal: args.signal,
    });
    if (!crm.ok) return crm;
  }

  return ok({ status: outcome.value.status });
}

// Stamp last_error_id for a failed sync and return the original error. Errors here are
// values (the caller decides retry); we never throw raw and never store token data.
async function stampError(
  db: Db,
  accountId: string,
  error: AppError,
  signal: AbortSignal,
): Promise<Result<never, AppError>> {
  await db.execute(sql`UPDATE email_accounts SET last_error_id=${error.id} WHERE id=${accountId}`);
  signal.throwIfAborted();
  return err(error);
}
