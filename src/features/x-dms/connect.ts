import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccounts } from "@/db/schema/xDms";
import { encryptToken } from "@/features/email/crypto";
import { assertTeamMailboxAdmin } from "@/features/email/teamMailboxConnect";
import { err, ok, type Result } from "@/types/result";
import type { XClient } from "./types";

export async function completeXConnect(
  db: Db,
  client: XClient,
  args: { actorId: string; code: string; codeVerifier: string },
  signal: AbortSignal,
): Promise<Result<{ accountId: string }, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const tokens = await client.exchangeCode(
    { code: args.code, codeVerifier: args.codeVerifier },
    signal,
  );
  signal.throwIfAborted();
  if (!tokens.ok) return tokens;
  const me = await client.getMe(tokens.value.accessToken, signal);
  signal.throwIfAborted();
  if (!me.ok) return me;
  const values = {
    username: me.value.username,
    avatarUrl: me.value.profileImageUrl,
    refreshTokenEnc: encryptToken(tokens.value.refreshToken),
    accessTokenEnc: encryptToken(tokens.value.accessToken),
    accessTokenExpiresAt: tokens.value.expiresAt,
    scopes: tokens.value.scopes,
    status: "connected" as const,
    lastErrorId: null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(xAccounts)
    .values({
      ...values,
      xUserId: me.value.id,
      displayName: `@${me.value.username}`,
      connectedByUserId: args.actorId,
    })
    .onConflictDoUpdate({ target: xAccounts.xUserId, set: values })
    .returning({ id: xAccounts.id });
  signal.throwIfAborted();
  return row === undefined
    ? err(new AppError(ERROR_IDS.X_OAUTH_FAILED, "x account upsert returned no row", {}))
    : ok({ accountId: row.id });
}
