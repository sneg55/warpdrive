import { and, eq, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccounts } from "@/db/schema/xDms";
import { decryptToken, encryptToken } from "@/features/email/crypto";
import { err, ok, type Result } from "@/types/result";
import type { XClient } from "./types";

const EXPIRY_MARGIN_MS = 60_000;
const UNAUTHORIZED = 401;

type AccountRow = typeof xAccounts.$inferSelect;

interface FreshToken {
  token: string;
  credential: Buffer;
}

function storedAccessToken(row: AccountRow): string | null {
  if (!row.accessTokenEnc || !row.accessTokenExpiresAt) return null;
  if (row.accessTokenExpiresAt.getTime() - Date.now() <= EXPIRY_MARGIN_MS) return null;
  const decrypted = decryptToken(row.accessTokenEnc);
  return decrypted.ok ? decrypted.value : null;
}

async function markReconnectRequired(
  db: Db,
  accountId: string,
  cause: AppError,
  credential: Buffer | null,
): Promise<Result<never, AppError>> {
  const updated = await db
    .update(xAccounts)
    .set({
      status: "reconnect_required",
      lastErrorId: ERROR_IDS.X_TOKEN_REFRESH_FAILED,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(xAccounts.id, accountId),
        sql`${xAccounts.accessTokenEnc} IS NOT DISTINCT FROM ${credential}`,
      ),
    )
    .returning({ id: xAccounts.id });
  if (updated.length === 0) return err(cause);
  return err(
    new AppError(ERROR_IDS.X_RECONNECT_REQUIRED, "X account needs to be reconnected", {
      accountId,
      causeId: cause.id,
    }),
  );
}

async function refreshLocked(
  tx: Db,
  client: XClient,
  accountId: string,
  rejectedToken: string | null,
  signal: AbortSignal,
): Promise<Result<FreshToken, AppError>> {
  const [row] = await tx.select().from(xAccounts).where(eq(xAccounts.id, accountId)).for("update");
  if (!row) return err(accountNotFound(accountId));
  const current = storedAccessToken(row);
  if (current !== null && current !== rejectedToken && row.accessTokenEnc)
    return ok({ token: current, credential: row.accessTokenEnc });
  const decrypted = row.refreshTokenEnc ? decryptToken(row.refreshTokenEnc) : null;
  if (decrypted === null || !decrypted.ok) {
    const cause =
      decrypted === null
        ? new AppError(ERROR_IDS.X_TOKEN_REFRESH_FAILED, "no refresh token stored")
        : decrypted.error;
    return markReconnectRequired(tx, accountId, cause, row.accessTokenEnc);
  }
  const refreshed = await client.refresh(decrypted.value, signal);
  if (!refreshed.ok) {
    if (isTransient(refreshed.error)) return refreshed;
    return markReconnectRequired(tx, accountId, refreshed.error, row.accessTokenEnc);
  }
  const t = refreshed.value;
  const credential = encryptToken(t.accessToken);
  await tx
    .update(xAccounts)
    .set({
      accessTokenEnc: credential,
      refreshTokenEnc: encryptToken(t.refreshToken),
      accessTokenExpiresAt: t.expiresAt,
      status: "connected",
      lastErrorId: null,
      updatedAt: new Date(),
    })
    .where(eq(xAccounts.id, accountId));
  return ok({ token: t.accessToken, credential });
}

const refreshAccessToken = (
  db: Db,
  client: XClient,
  accountId: string,
  rejectedToken: string | null,
  signal: AbortSignal,
): Promise<Result<FreshToken, AppError>> =>
  db.transaction((tx) =>
    refreshLocked(tx as unknown as Db, client, accountId, rejectedToken, signal),
  );

const accountNotFound = (accountId: string): AppError =>
  new AppError(ERROR_IDS.X_ACCOUNT_NOT_FOUND, "X account not found", { accountId });

const isTransient = (e: AppError): boolean =>
  e.id === ERROR_IDS.X_RATE_LIMITED || e.context?.transient === true;

const isUnauthorized = (e: AppError): boolean =>
  e.id === ERROR_IDS.X_HTTP_FAILED && e.context?.status === UNAUTHORIZED;

export async function withAccessToken<T>(
  db: Db,
  client: XClient,
  accountId: string,
  call: (accessToken: string) => Promise<Result<T, AppError>>,
  signal: AbortSignal,
): Promise<Result<T, AppError>> {
  const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, accountId));
  if (!row) return err(accountNotFound(accountId));
  let token = storedAccessToken(row);
  if (token === null) {
    const refreshed = await refreshAccessToken(db, client, accountId, null, signal);
    if (!refreshed.ok) return refreshed;
    token = refreshed.value.token;
  }
  const first = await call(token);
  if (first.ok || !isUnauthorized(first.error)) return first;

  const refreshed = await refreshAccessToken(db, client, accountId, token, signal);
  if (!refreshed.ok) return refreshed;
  const second = await call(refreshed.value.token);
  if (second.ok || !isUnauthorized(second.error)) return second;
  return markReconnectRequired(db, accountId, second.error, refreshed.value.credential);
}
