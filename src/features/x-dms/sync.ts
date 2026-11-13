import { asc, eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { X_FIRST_RUN_DAYS, X_SYNC_ACCOUNT_TIMEOUT_MS } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { xAccounts } from "@/db/schema/xDms";
import { err, ok, type Result } from "@/types/result";
import { applyConversation } from "./applyEvents";
import { parseChatEvents } from "./eventParser";
import { type FetchContext, fetchNewEvents, listChangedConversations } from "./fetchChanges";
import type { XClient } from "./types";

const DAY_MS = 86_400_000;

export interface SyncDeps {
  db: Db;
  client: XClient;
  nowMs: () => number;
  accountTimeoutMs?: number;
}

export interface SyncCounts {
  conversations: number;
  messages: number;
}

const notFound = (accountId: string) =>
  new AppError(ERROR_IDS.X_ACCOUNT_NOT_FOUND, "X account not found", { accountId });

async function syncAccount(
  deps: SyncDeps,
  accountId: string,
  signal: AbortSignal,
): Promise<Result<SyncCounts, AppError>> {
  const [account] = await deps.db.select().from(xAccounts).where(eq(xAccounts.id, accountId));
  signal.throwIfAborted();
  if (account === undefined) return err(notFound(accountId));
  if (account.status !== "connected")
    return err(
      new AppError(ERROR_IDS.X_RECONNECT_REQUIRED, "X account needs to be reconnected", {
        accountId,
      }),
    );
  const ctx: FetchContext = {
    db: deps.db,
    client: deps.client,
    accountId,
    accountXUserId: account.xUserId,
    signal,
  };
  const firstRun = account.conversationsSyncedAt === null;
  const windowFloorMs = deps.nowMs() - X_FIRST_RUN_DAYS * DAY_MS;
  const changed = await listChangedConversations(ctx, windowFloorMs);
  if (!changed.ok) return changed;
  const counts: SyncCounts = { conversations: 0, messages: 0 };
  for (const item of [...changed.value].reverse()) {
    const events = await fetchNewEvents(ctx, {
      conversationId: item.conversation.id,
      storedNewestEventId: item.storedNewestEventId,
      floorMs: item.isNew ? windowFloorMs : null,
    });
    if (!events.ok) return events;
    const parsed = await parseChatEvents(events.value);
    signal.throwIfAborted();
    if (parsed.failedEventIds.length > 0)
      console.warn(`x sync: ${parsed.failedEventIds.length} events did not parse`, { accountId });
    const applied = await applyConversation(
      deps.db,
      {
        accountId,
        accountXUserId: account.xUserId,
        changed: item,
        events: events.value,
        parsed,
        firstRun,
        now: new Date(deps.nowMs()),
      },
      signal,
    );
    if (!applied.ok) return applied;
    counts.conversations += 1;
    counts.messages += applied.value.messages;
  }
  const done = await deps.db
    .update(xAccounts)
    .set({ conversationsSyncedAt: new Date(deps.nowMs()) })
    .where(eq(xAccounts.id, accountId))
    .returning({ id: xAccounts.id });
  signal.throwIfAborted();
  return done.length === 0 ? err(notFound(accountId)) : ok(counts);
}

export function runXSync(
  deps: SyncDeps,
  accountId: string,
  signal: AbortSignal,
): Promise<Result<SyncCounts, AppError>> {
  return syncAccount(deps, accountId, signal);
}

async function recordOutcome(
  deps: SyncDeps,
  accountId: string,
  r: Result<SyncCounts, AppError>,
  signal: AbortSignal,
): Promise<void> {
  if (!r.ok && r.error.id === ERROR_IDS.X_RECONNECT_REQUIRED) return;
  await deps.db
    .update(xAccounts)
    .set({
      ...(r.ok
        ? { lastSyncAt: new Date(deps.nowMs()), lastErrorId: null }
        : { lastErrorId: r.error.id }),
      updatedAt: new Date(),
    })
    .where(eq(xAccounts.id, accountId));
  signal.throwIfAborted();
}

async function runAccount(
  deps: SyncDeps,
  accountId: string,
  runSignal: AbortSignal,
): Promise<Result<SyncCounts, AppError>> {
  await deps.db.update(xAccounts).set({ updatedAt: new Date() }).where(eq(xAccounts.id, accountId));
  runSignal.throwIfAborted();
  const timeoutMs = deps.accountTimeoutMs ?? X_SYNC_ACCOUNT_TIMEOUT_MS;
  const signal = AbortSignal.any([runSignal, AbortSignal.timeout(timeoutMs)]);
  try {
    return await runXSync(deps, accountId, signal);
  } catch (e) {
    if (runSignal.aborted || !signal.aborted) throw e;
    return err(
      new AppError(ERROR_IDS.X_HTTP_FAILED, "x sync: account run hit its time limit", {
        accountId,
        timeoutMs,
        transient: true,
      }),
    );
  }
}

export async function runXSyncAll(
  deps: SyncDeps,
  signal: AbortSignal,
): Promise<Result<void, AppError>[]> {
  const accounts = await deps.db
    .select({ id: xAccounts.id })
    .from(xAccounts)
    .where(eq(xAccounts.status, "connected"))
    .orderBy(asc(xAccounts.updatedAt), asc(xAccounts.id));
  signal.throwIfAborted();
  const results: Result<void, AppError>[] = [];
  for (const account of accounts) {
    const r = await runAccount(deps, account.id, signal);
    if (!r.ok) console.error(`${r.error.id} x sync: account run failed`, { accountId: account.id });
    await recordOutcome(deps, account.id, r, signal);
    results.push(r.ok ? ok(undefined) : r);
  }
  return results;
}
