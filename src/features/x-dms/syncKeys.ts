import { eq } from "drizzle-orm";
import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import { xAccounts } from "@/db/schema/xDms";
import { ok, type Result } from "@/types/result";
import { loadChatKeys, NUMERIC_VERSION, newestKey, newestKeyUnsigned } from "./chatKeys";
import type { KeyedParseOptions } from "./eventParser";
import type { ChangedConversation } from "./fetchChanges";
import { type ChatKeyring, createChatKeyring, toSigningKeys } from "./keyedParser";
import type { SyncDeps } from "./sync";
import { withAccessToken } from "./tokens";
import type { XPublicKey, XSigningKey } from "./types";

export interface RunKeys {
  keyring: ChatKeyring | null;
  accountSigningKeys: XSigningKey[];
  accountNewestUnsigned: boolean;
  participants: Map<string, XSigningKey[]>;
}

interface Account {
  id: string;
  xUserId: string;
}

const NO_KEY_ROWS = "none";

function fetchPublicKeys(
  deps: SyncDeps,
  accountId: string,
  userId: string,
  signal: AbortSignal,
): Promise<Result<XPublicKey[], AppError>> {
  return withAccessToken(
    deps.db,
    deps.client,
    accountId,
    (token) => deps.client.getPublicKeys(token, userId, signal),
    signal,
  );
}

async function refreshAccountPublicKeys(
  deps: SyncDeps,
  account: Account,
  signal: AbortSignal,
): Promise<Result<XPublicKey[], AppError>> {
  const keys = await fetchPublicKeys(deps, account.id, account.xUserId, signal);
  if (!keys.ok) return keys;
  const newest = newestKey(keys.value.filter((k) => NUMERIC_VERSION.test(k.version)));
  if (newest !== null) {
    await deps.db
      .update(xAccounts)
      .set({ chatLatestKeyVersion: newest.version })
      .where(eq(xAccounts.id, account.id));
    signal.throwIfAborted();
  }
  return keys;
}

export async function refreshChatKeyVersion(
  deps: SyncDeps,
  account: Account,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const r = await refreshAccountPublicKeys(deps, account, signal);
  return r.ok ? ok(undefined) : r;
}

async function openKeyring(
  deps: SyncDeps,
  account: Account,
  signal: AbortSignal,
): Promise<ChatKeyring | null | typeof NO_KEY_ROWS> {
  const loaded = await loadChatKeys(deps.db, account.id, signal);
  if (loaded.ok && loaded.value.length === 0) return NO_KEY_ROWS;
  let keyring: Result<ChatKeyring, AppError> | null = null;
  if (loaded.ok) {
    try {
      keyring = await createChatKeyring({ xUserId: account.xUserId, keys: loaded.value });
    } finally {
      for (const k of loaded.value) k.blob.fill(0);
    }
  }
  if (keyring?.ok === true) return keyring.value;
  await deps.db
    .update(xAccounts)
    .set({ chatKeysBrokenAt: new Date(deps.nowMs()) })
    .where(eq(xAccounts.id, account.id));
  signal.throwIfAborted();
  console.error(`${ERROR_IDS.X_CHAT_KEYS_STALE} x sync: chat keys could not be loaded`, {
    accountId: account.id,
  });
  return null;
}

export async function openRunKeys(
  deps: SyncDeps,
  account: Account,
  signal: AbortSignal,
): Promise<RunKeys | null> {
  const keyring = await openKeyring(deps, account, signal);
  if (keyring === NO_KEY_ROWS) return null;
  try {
    const published = await refreshAccountPublicKeys(deps, account, signal);
    if (!published.ok)
      console.error(`${published.error.id} x sync: chat key version refresh failed`, {
        accountId: account.id,
      });
    return {
      keyring,
      accountSigningKeys: published.ok ? toSigningKeys(account.xUserId, published.value) : [],
      accountNewestUnsigned: published.ok && newestKeyUnsigned(published.value),
      participants: new Map(),
    };
  } catch (e) {
    keyring?.dispose();
    throw e;
  }
}

async function participantSigningKeys(
  deps: SyncDeps,
  run: RunKeys,
  a: { accountId: string; userId: string },
  signal: AbortSignal,
): Promise<XSigningKey[]> {
  const cached = run.participants.get(a.userId);
  if (cached !== undefined) return cached;
  const r = await fetchPublicKeys(deps, a.accountId, a.userId, signal);
  if (!r.ok)
    console.error(`${r.error.id} x sync: participant public keys failed`, {
      accountId: a.accountId,
    });
  const keys = r.ok ? toSigningKeys(a.userId, r.value) : [];
  run.participants.set(a.userId, keys);
  return keys;
}

export async function keyedParseOptions(
  deps: SyncDeps,
  run: RunKeys | null,
  a: { accountId: string; item: ChangedConversation; keyEvents: string[]; contextEvents: string[] },
  signal: AbortSignal,
): Promise<KeyedParseOptions | undefined> {
  const keyring = run?.keyring ?? null;
  if (run === null || keyring === null) return undefined;
  if (!a.item.isNew && !a.item.storedEncrypted && a.keyEvents.length === 0) return undefined;
  const participant = await participantSigningKeys(
    deps,
    run,
    { accountId: a.accountId, userId: a.item.participantId },
    signal,
  );
  return {
    keyring,
    keyEvents: a.keyEvents,
    contextEvents: a.contextEvents,
    signingKeys: [...run.accountSigningKeys, ...participant],
  };
}
