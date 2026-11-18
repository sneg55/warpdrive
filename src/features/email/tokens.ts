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

  const dec = decryptToken(row.refresh_token_enc);
  if (!dec.ok) return dec;

  const refreshed = await args.deps.refresh(dec.value);
  if (!refreshed.ok) {
    if (refreshed.error.id === "E_GMAIL_002") {
      await db.execute(sql`
        UPDATE email_accounts
        SET status='disconnected', last_error_id='E_GMAIL_002', refresh_token_enc=NULL, updated_at=now()
        WHERE id=${args.accountId}
      `);
    }
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
