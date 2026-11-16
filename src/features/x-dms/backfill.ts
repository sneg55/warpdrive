import { and, asc, desc, eq, gte, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  X_BACKFILL_MAX_CONVERSATIONS_PER_RUN,
  X_BACKFILL_RESUME_DELAY_SECONDS,
  X_FIRST_RUN_DAYS,
} from "@/constants/xDms";
import type { Db } from "@/db/client";
import { xAccountChatKeys, xAccounts, xConversations } from "@/db/schema/xDms";
import { err, ok, type Result } from "@/types/result";
import {
  type BackfillRun,
  backfillConversation,
  markDone,
  type PendingConversation,
} from "./backfillConversation";
import { stopsBackfillRun } from "./backfillSupport";
import { accountKeyUnsigned } from "./chatKeys";
import type { SyncDeps } from "./sync";
import { openRunKeys, type RunKeys } from "./syncKeys";

const DAY_MS = 86_400_000;

export interface BackfillCounts {
  conversations: number;
  keysCreated: number;
}

const none = (): BackfillCounts => ({ conversations: 0, keysCreated: 0 });

const backfillWindowFloorMs = (nowMs: number): number => nowMs - X_FIRST_RUN_DAYS * DAY_MS;

const newestHeldVersion = (accountId: string): SQL =>
  sql`(SELECT ${xAccountChatKeys.keyVersion} FROM ${xAccountChatKeys} WHERE ${eq(
    xAccountChatKeys.accountId,
    accountId,
  )} ORDER BY ${xAccountChatKeys.keyVersion}::numeric DESC LIMIT 1)`;

const pendingFor = (accountId: string, windowFloorMs: number, version: SQL | string) =>
  and(
    eq(xConversations.accountId, accountId),
    eq(xConversations.encrypted, true),
    gte(xConversations.lastMessageAt, new Date(windowFloorMs)),
    sql`${xConversations.backfilledKeyVersion} IS DISTINCT FROM ${version}`,
  );

export async function backfillPending(
  db: Db,
  a: { accountId: string; windowFloorMs: number; nowMs: number },
  signal: AbortSignal,
): Promise<boolean> {
  const { accountId, windowFloorMs } = a;
  const resumeBefore = new Date(a.nowMs - X_BACKFILL_RESUME_DELAY_SECONDS * 1000);
  const held = newestHeldVersion(accountId);
  const [row] = await db
    .select({ id: xConversations.id })
    .from(xConversations)
    .innerJoin(xAccounts, eq(xAccounts.id, xConversations.accountId))
    .where(
      and(
        pendingFor(accountId, windowFloorMs, held),
        sql`${held} IS NOT NULL`,
        isNull(xAccounts.chatKeysBrokenAt),
        sql`${xAccounts.chatLatestKeyVersion} IS NOT DISTINCT FROM ${held}`,
        or(
          isNull(xAccounts.chatBackfillStartedAt),
          lt(xAccounts.chatBackfillStartedAt, resumeBefore),
        ),
      ),
    )
    .limit(1);
  signal.throwIfAborted();
  return row !== undefined;
}

async function runAll(
  run: BackfillRun,
  pending: PendingConversation[],
  counts: BackfillCounts,
): Promise<Result<BackfillCounts, AppError>> {
  for (const row of pending) {
    const r = await backfillConversation(run, row);
    if (!r.ok) {
      if (stopsBackfillRun(r.error)) return r;
      console.error(`${r.error.id} x backfill: conversation skipped`, {
        accountId: run.ctx.accountId,
        ...counts,
      });
      await markDone(run, row);
      run.ctx.signal.throwIfAborted();
      continue;
    }
    if (r.value.done) counts.conversations += 1;
    if (r.value.created) counts.keysCreated += 1;
  }
  return ok(counts);
}

function startRun(
  deps: SyncDeps,
  a: { accountId: string; xUserId: string; heldVersion: string; windowFloorMs: number },
  keys: RunKeys,
  signal: AbortSignal,
): Result<BackfillRun, AppError> {
  if (keys.keyring === null)
    return err(
      new AppError(ERROR_IDS.X_CHAT_KEYS_STALE, "x backfill: chat keys could not be loaded", {
        accountId: a.accountId,
      }),
    );
  if (keys.accountNewestUnsigned) return err(accountKeyUnsigned(a.accountId));
  if (keys.accountSigningKeys.length === 0)
    return err(
      new AppError(ERROR_IDS.X_PUBLIC_KEYS_MISSING, "x backfill: account public keys missing", {
        accountId: a.accountId,
        transient: true,
      }),
    );
  return ok({
    deps,
    ctx: {
      db: deps.db,
      client: deps.client,
      accountId: a.accountId,
      accountXUserId: a.xUserId,
      signal,
    },
    keys,
    participants: new Map(),
    keyring: keys.keyring,
    heldVersion: a.heldVersion,
    windowFloorMs: a.windowFloorMs,
  });
}

async function loadPending(
  deps: SyncDeps,
  accountId: string,
  signal: AbortSignal,
): Promise<{ heldVersion: string; windowFloorMs: number; rows: PendingConversation[] } | null> {
  const [held] = await deps.db
    .select({ keyVersion: xAccountChatKeys.keyVersion })
    .from(xAccountChatKeys)
    .where(eq(xAccountChatKeys.accountId, accountId))
    .orderBy(desc(sql`${xAccountChatKeys.keyVersion}::numeric`))
    .limit(1);
  signal.throwIfAborted();
  if (held === undefined) return null;
  const windowFloorMs = backfillWindowFloorMs(deps.nowMs());
  const rows = await deps.db
    .select()
    .from(xConversations)
    .where(pendingFor(accountId, windowFloorMs, held.keyVersion))
    .orderBy(desc(xConversations.lastMessageAt), asc(xConversations.id))
    .limit(X_BACKFILL_MAX_CONVERSATIONS_PER_RUN);
  signal.throwIfAborted();
  return { heldVersion: held.keyVersion, windowFloorMs, rows };
}

export async function runXChatBackfill(
  deps: SyncDeps,
  accountId: string,
  signal: AbortSignal,
): Promise<Result<BackfillCounts, AppError>> {
  const [account] = await deps.db.select().from(xAccounts).where(eq(xAccounts.id, accountId));
  signal.throwIfAborted();
  if (account === undefined)
    return err(new AppError(ERROR_IDS.X_ACCOUNT_NOT_FOUND, "X account not found", { accountId }));
  if (account.status !== "connected")
    return err(
      new AppError(ERROR_IDS.X_RECONNECT_REQUIRED, "X account needs to be reconnected", {
        accountId,
      }),
    );
  const pending = await loadPending(deps, accountId, signal);
  if (pending === null || pending.rows.length === 0) return ok(none());
  await deps.db
    .update(xAccounts)
    .set({ chatBackfillStartedAt: new Date(deps.nowMs()) })
    .where(eq(xAccounts.id, accountId));
  signal.throwIfAborted();
  const keys = await openRunKeys(deps, { id: accountId, xUserId: account.xUserId }, signal);
  if (keys === null) return ok(none());
  const counts = none();
  try {
    const run = startRun(deps, { accountId, xUserId: account.xUserId, ...pending }, keys, signal);
    const r = run.ok ? await runAll(run.value, pending.rows, counts) : run;
    if (!r.ok) console.error(`${r.error.id} x backfill: run stopped`, { accountId, ...counts });
    return r;
  } finally {
    keys.keyring?.dispose();
  }
}
