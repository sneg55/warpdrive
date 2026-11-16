import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccountChatKeys, xAccounts, xConversations } from "@/db/schema/xDms";
import { decryptToken, encryptToken } from "@/features/email/crypto";
import { assertTeamMailboxAdmin } from "@/features/email/teamMailboxConnect";
import { err, ok, type Result } from "@/types/result";
import { publishXAccountEncryptedConversationsUpdated } from "./events";
import type { ChatKeyUnlocker } from "./juicebox";
import { withAccessToken } from "./tokens";
import type { XClient, XPublicKey } from "./types";

const unlockFailed = (accountId: string, reason: string): AppError =>
  new AppError(ERROR_IDS.X_UNLOCK_FAILED, "x chat key unlock failed", { accountId, reason });

export const NUMERIC_VERSION = /^\d+$/;

export function newestKey(keys: XPublicKey[]): XPublicKey | null {
  return keys.reduce<XPublicKey | null>(
    (best, k) => (best === null || BigInt(k.version) > BigInt(best.version) ? k : best),
    null,
  );
}

export function newestKeyUnsigned(keys: XPublicKey[]): boolean {
  return (
    newestKey(keys.filter((k) => NUMERIC_VERSION.test(k.version)))?.identityPublicKeySignature ===
    null
  );
}

export const accountKeyUnsigned = (accountId: string): AppError =>
  new AppError(ERROR_IDS.X_CHAT_KEYS_STALE, "x chat: the account's newest public key is unsigned", {
    accountId,
  });

export async function unlockChatKeys(
  deps: { db: Db; client: XClient; unlocker: ChatKeyUnlocker },
  a: { actorId: string; accountId: string; passcode: string },
  signal: AbortSignal,
): Promise<Result<{ keyVersion: string }, AppError>> {
  const { db, client, unlocker } = deps;
  const allowed = await assertTeamMailboxAdmin(db, a.actorId, signal);
  if (!allowed.ok) return allowed;
  const [account] = await db
    .select({ xUserId: xAccounts.xUserId })
    .from(xAccounts)
    .where(eq(xAccounts.id, a.accountId));
  signal.throwIfAborted();
  if (!account) return err(unlockFailed(a.accountId, "account_missing"));
  const keys = await withAccessToken(
    db,
    client,
    a.accountId,
    (token) => client.getPublicKeys(token, account.xUserId, signal),
    signal,
  );
  if (!keys.ok) return keys;
  if (keys.value.some((k) => !NUMERIC_VERSION.test(k.version))) {
    return err(unlockFailed(a.accountId, "version_not_numeric"));
  }
  const newest = newestKey(keys.value);
  if (newest === null || newest.juiceboxConfig === null || newest.juiceboxConfig === undefined) {
    return err(unlockFailed(a.accountId, "no_juicebox_config"));
  }
  const unlocked = await unlocker.unlock(
    { accountId: a.accountId, juiceboxConfig: newest.juiceboxConfig, passcode: a.passcode },
    signal,
  );
  if (!unlocked.ok) return unlocked;
  const blob = unlocked.value;
  try {
    const keysEnc = encryptToken(Buffer.from(blob).toString("base64"));
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .insert(xAccountChatKeys)
        .values({
          accountId: a.accountId,
          keyVersion: newest.version,
          keysEnc,
          unlockedAt: now,
          unlockedByUserId: a.actorId,
        })
        .onConflictDoUpdate({
          target: [xAccountChatKeys.accountId, xAccountChatKeys.keyVersion],
          set: { keysEnc, unlockedAt: now, unlockedByUserId: a.actorId },
        });
      await tx
        .update(xAccounts)
        .set({ chatLatestKeyVersion: newest.version, chatKeysBrokenAt: null, updatedAt: now })
        .where(eq(xAccounts.id, a.accountId));
      await publishXAccountEncryptedConversationsUpdated(tx, a.accountId, a.actorId, signal);
    });
  } finally {
    blob.fill(0);
  }
  signal.throwIfAborted();
  return ok({ keyVersion: newest.version });
}

const base64Schema = z.string().min(1);

export async function loadChatKeys(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<Result<{ keyVersion: string; blob: Uint8Array }[], AppError>> {
  const rows = await db
    .select({ keyVersion: xAccountChatKeys.keyVersion, keysEnc: xAccountChatKeys.keysEnc })
    .from(xAccountChatKeys)
    .where(eq(xAccountChatKeys.accountId, accountId))
    .orderBy(desc(sql`${xAccountChatKeys.keyVersion}::numeric`));
  signal.throwIfAborted();
  const out: { keyVersion: string; blob: Uint8Array }[] = [];
  for (const row of rows) {
    const dec = decryptToken(row.keysEnc);
    const text = dec.ok ? base64Schema.safeParse(dec.value) : null;
    if (!dec.ok || text === null || !text.success) {
      for (const k of out) k.blob.fill(0);
      return dec.ok ? err(unlockFailed(accountId, "stored_keys_invalid")) : dec;
    }
    out.push({
      keyVersion: row.keyVersion,
      blob: new Uint8Array(Buffer.from(text.data, "base64")),
    });
  }
  return ok(out);
}

export async function removeChatKeys(
  db: Db,
  a: { actorId: string; accountId: string },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, a.actorId, signal);
  if (!allowed.ok) return allowed;
  await db.transaction(async (tx) => {
    await tx.delete(xAccountChatKeys).where(eq(xAccountChatKeys.accountId, a.accountId));
    await tx
      .update(xAccounts)
      .set({ chatLatestKeyVersion: null, updatedAt: new Date() })
      .where(eq(xAccounts.id, a.accountId));
    await tx
      .update(xConversations)
      .set({ backfilledKeyVersion: null })
      .where(eq(xConversations.accountId, a.accountId));
    await publishXAccountEncryptedConversationsUpdated(tx, a.accountId, a.actorId, signal);
  });
  signal.throwIfAborted();
  return ok(undefined);
}
