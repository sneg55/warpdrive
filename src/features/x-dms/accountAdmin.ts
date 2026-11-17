import { and, asc, eq, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { users } from "@/db/schema/identity";
import { xAccountChatKeys, xAccountMembers, xAccounts } from "@/db/schema/xDms";
import { decryptToken } from "@/features/email/crypto";
import { assertTeamMailboxAdmin } from "@/features/email/teamMailboxConnect";
import { err, ok, type Result } from "@/types/result";
import type { XChatKeyState } from "@/types/xChat";
import { chatKeyState } from "./chatKeyState";
import type { XClient } from "./types";

export interface XAccountSettings {
  id: string;
  displayName: string;
  username: string;
  status: "connected" | "reconnect_required";
  memberIds: string[];
  lastSyncAt: Date | null;
  lastErrorId: string | null;
  overdueAfterHours: number;
  chatKeyState: XChatKeyState;
  chatKeysUnlockedAt: Date | null;
  chatKeysUnlockedByName: string | null;
}

const notFound = (): AppError =>
  new AppError(ERROR_IDS.X_ACCOUNT_NOT_FOUND, "x account not found", {});

export async function updateXAccount(
  db: Db,
  args: { actorId: string; accountId: string; displayName: string; overdueAfterHours: number },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const rows = await db
    .update(xAccounts)
    .set({
      displayName: args.displayName,
      overdueAfterHours: args.overdueAfterHours,
      updatedAt: new Date(),
    })
    .where(eq(xAccounts.id, args.accountId))
    .returning({ id: xAccounts.id });
  signal.throwIfAborted();
  return rows.length > 0 ? ok(undefined) : err(notFound());
}

export async function setXAccountMembers(
  db: Db,
  args: { actorId: string; accountId: string; userIds: string[] },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const ids = JSON.stringify([...new Set(args.userIds)]);
  const wanted = sql`SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb)`;
  const result = await db.transaction(async (tx) => {
    const account = await tx.execute(
      sql`SELECT id FROM x_accounts WHERE id=${args.accountId} FOR UPDATE`,
    );
    signal.throwIfAborted();
    if (account.rows.length === 0) return err(notFound());
    const missing = await tx.execute(
      sql`SELECT id FROM (${wanted}) AS selected(id) WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.id=selected.id AND is_active)`,
    );
    signal.throwIfAborted();
    if (missing.rows.length > 0)
      return err(new AppError(ERROR_IDS.X_INPUT_INVALID, "member not found or inactive", {}));
    await tx.execute(
      sql`DELETE FROM x_account_members WHERE account_id=${args.accountId} AND user_id NOT IN (${wanted})`,
    );
    signal.throwIfAborted();
    await tx
      .insert(xAccountMembers)
      .select(
        sql`SELECT ${args.accountId}::uuid, value::uuid FROM jsonb_array_elements_text(${ids}::jsonb)`,
      )
      .onConflictDoNothing();
    signal.throwIfAborted();
    return ok(undefined);
  });
  signal.throwIfAborted();
  return result;
}

export async function disconnectXAccount(
  db: Db,
  client: XClient,
  args: { actorId: string; accountId: string },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ refreshTokenEnc: xAccounts.refreshTokenEnc })
      .from(xAccounts)
      .where(eq(xAccounts.id, args.accountId))
      .for("update");
    signal.throwIfAborted();
    if (row === undefined) return err(notFound());
    const refresh = row.refreshTokenEnc === null ? null : decryptToken(row.refreshTokenEnc);
    if (refresh?.ok === true) {
      await client.revoke(refresh.value, signal);
      signal.throwIfAborted();
    }
    await tx.delete(xAccounts).where(eq(xAccounts.id, args.accountId));
    return ok(undefined);
  });
  signal.throwIfAborted();
  return result;
}

export async function listXAccountsForAdmin(
  db: Db,
  actorId: string,
  signal: AbortSignal,
): Promise<Result<XAccountSettings[], AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, actorId, signal);
  if (!allowed.ok) return allowed;
  const accounts = await db
    .select({
      id: xAccounts.id,
      displayName: xAccounts.displayName,
      username: xAccounts.username,
      status: xAccounts.status,
      lastSyncAt: xAccounts.lastSyncAt,
      lastErrorId: xAccounts.lastErrorId,
      overdueAfterHours: xAccounts.overdueAfterHours,
      chatLatestKeyVersion: xAccounts.chatLatestKeyVersion,
      chatKeysBrokenAt: xAccounts.chatKeysBrokenAt,
    })
    .from(xAccounts)
    .orderBy(asc(xAccounts.displayName), asc(xAccounts.id));
  signal.throwIfAborted();
  const members = await db
    .select({ accountId: xAccountMembers.accountId, userId: xAccountMembers.userId })
    .from(xAccountMembers)
    .innerJoin(users, and(eq(users.id, xAccountMembers.userId), eq(users.isActive, true)));
  signal.throwIfAborted();
  const keys = await db
    .select({
      accountId: xAccountChatKeys.accountId,
      keyVersion: xAccountChatKeys.keyVersion,
      unlockedAt: xAccountChatKeys.unlockedAt,
      unlockedByName: users.name,
    })
    .from(xAccountChatKeys)
    .leftJoin(users, eq(users.id, xAccountChatKeys.unlockedByUserId));
  signal.throwIfAborted();
  return ok(
    accounts.map(({ chatLatestKeyVersion, chatKeysBrokenAt, ...account }) => {
      const mine = keys.filter((k) => k.accountId === account.id);
      const latest = mine.reduce<(typeof mine)[number] | null>(
        (best, k) => (best === null || k.unlockedAt > best.unlockedAt ? k : best),
        null,
      );
      return {
        ...account,
        memberIds: members.filter((m) => m.accountId === account.id).map((m) => m.userId),
        chatKeyState: chatKeyState({
          keyVersions: mine.map((k) => k.keyVersion),
          latestKeyVersion: chatLatestKeyVersion,
          brokenAt: chatKeysBrokenAt,
        }),
        chatKeysUnlockedAt: latest?.unlockedAt ?? null,
        chatKeysUnlockedByName: latest?.unlockedByName ?? null,
      };
    }),
  );
}
