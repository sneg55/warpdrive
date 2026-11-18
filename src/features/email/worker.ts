import { sql } from "drizzle-orm";
import { EMAIL_PROVIDER_KIND, SYNC_JITTER_MODULO_SECONDS } from "@/constants/email";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { db as prodDb } from "@/db/client";
import { makeStorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import { syncAgenticMailbox } from "./agenticSync";
import { processSendAttempt } from "./outbox";
import { resolveProvider } from "./provider/resolveProvider";
import type { MailProvider } from "./provider/types";
import { syncMailbox } from "./sync";
import { performWorkerSendCrm } from "./workerSendCrm";

export function jitterFor(accountId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i++) {
    hash ^= accountId.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % SYNC_JITTER_MODULO_SECONDS;
}

export interface SyncDeps {
  resolveClient: (
    accountId: string,
    signal: AbortSignal,
  ) => Promise<Result<MailProvider, AppError>>;
}

const defaultSyncDeps: SyncDeps = {
  resolveClient: (accountId, signal) => resolveProvider(prodDb, accountId, signal),
};

export async function runSyncJob(
  db: Db,
  args: { accountId: string; signal: AbortSignal },
  deps: SyncDeps = defaultSyncDeps,
): Promise<Result<{ applied: number }, AppError>> {
  args.signal.throwIfAborted();
  const provider = await deps.resolveClient(args.accountId, args.signal);
  if (!provider.ok) return stampError(db, args.accountId, provider.error, args.signal);
  const p = provider.value;
  const synced =
    p.kind === EMAIL_PROVIDER_KIND.agenticInbox
      ? await syncAgenticMailbox(db, {
          accountId: args.accountId,
          provider: p,
          client: p.agentic,
          signal: args.signal,
        })
      : await syncMailbox(db, { accountId: args.accountId, gmail: p.gmail, signal: args.signal });
  if (!synced.ok) return stampError(db, args.accountId, synced.error, args.signal);
  return ok(synced.value);
}

export async function runSendJob(
  db: Db,
  args: { accountId: string; idempotencyKey: string; signal: AbortSignal },
  deps: SyncDeps = defaultSyncDeps,
): Promise<Result<{ status: string }, AppError>> {
  args.signal.throwIfAborted();
  const provider = await deps.resolveClient(args.accountId, args.signal);
  if (!provider.ok) return provider;

  const outcome = await processSendAttempt(db, {
    accountId: args.accountId,
    idempotencyKey: args.idempotencyKey,
    provider: provider.value,
    storage: makeStorageClient(),
    signal: args.signal,
  });
  if (!outcome.ok) return outcome;

  if (outcome.value.status === "sent" && outcome.value.gmailMessageId !== undefined) {
    const crm = await performWorkerSendCrm(db, {
      accountId: args.accountId,
      idempotencyKey: args.idempotencyKey,
      gmailMessageId: outcome.value.gmailMessageId,
      provider: provider.value,
      signal: args.signal,
    });
    if (!crm.ok) return crm;
  }

  return ok({ status: outcome.value.status });
}

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
