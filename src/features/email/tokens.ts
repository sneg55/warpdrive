import { sql } from "drizzle-orm";
import { TOKEN_REFRESH_SKEW_SECONDS } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { decryptToken, encryptToken } from "./crypto";

export interface AccessToken {
  token: string;
  expiresAt: number;
}

interface RefreshDeps {
  refresh: (
    refreshToken: string,
  ) => Promise<Result<{ accessToken: string; expiresIn: number; refreshToken?: string }, AppError>>;
}

// Return a usable access token for an account, refreshing via deps.refresh when the
// cached one is missing or within TOKEN_REFRESH_SKEW_SECONDS of expiry.
//
// Failure handling distinguishes three causes, which must NOT be conflated:
//   - invalid_grant (E_GMAIL_002): a genuine OAuth revocation. Disconnect the account,
//     null the refresh token, record the error, and stop (caller stops polling).
//   - decrypt failure (E_GMAIL_005): a server-side key/data problem, NOT a revocation.
//     Propagate without disconnecting; the grant is still valid.
//   - transient (E_GMAIL_001): propagate without disconnecting; the caller retries later.
//
// On a rotated refresh token, re-encrypt and persist it. Never log token contents.
// db is the first param (repo db-first injection): tests pass an isolated db, the
// production caller passes the singleton.
export async function ensureAccessToken(
  db: Db,
  args: { accountId: string; cached?: AccessToken; now?: number; deps: RefreshDeps },
): Promise<Result<AccessToken, AppError>> {
  const now = args.now ?? Date.now();
  if (
    args.cached !== undefined &&
    args.cached.expiresAt - now > TOKEN_REFRESH_SKEW_SECONDS * 1000
  ) {
    return ok(args.cached);
  }

  const loaded = await db.execute(
    sql`SELECT refresh_token_enc FROM email_accounts WHERE id=${args.accountId}`,
  );
  const row = loaded.rows[0] as { refresh_token_enc: Buffer | null } | undefined;
  if (row === undefined || row.refresh_token_enc === null) {
    return err(
      new AppError("E_GMAIL_002", "no usable refresh token", { accountId: args.accountId }),
    );
  }

  // E_GMAIL_005 on failure: a key/data problem, not a revocation. Do NOT disconnect.
  const dec = decryptToken(row.refresh_token_enc);
  if (!dec.ok) return dec;

  const refreshed = await args.deps.refresh(dec.value);
  if (!refreshed.ok) {
    if (refreshed.error.id === "E_GMAIL_002") {
      // Genuine revocation: disconnect, null the token, record the cause.
      await db.execute(sql`
        UPDATE email_accounts
        SET status='disconnected', last_error_id='E_GMAIL_002', refresh_token_enc=NULL, updated_at=now()
        WHERE id=${args.accountId}
      `);
    }
    // Transient (E_GMAIL_001) and any other failure: propagate, do NOT disconnect.
    return refreshed;
  }

  if (refreshed.value.refreshToken !== undefined) {
    await db.execute(sql`
      UPDATE email_accounts
      SET refresh_token_enc=${encryptToken(refreshed.value.refreshToken)}, updated_at=now()
      WHERE id=${args.accountId}
    `);
  }

  return ok({
    token: refreshed.value.accessToken,
    expiresAt: now + refreshed.value.expiresIn * 1000,
  });
}
