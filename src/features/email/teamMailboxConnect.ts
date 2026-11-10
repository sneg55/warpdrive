import { sql } from "drizzle-orm";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { encryptToken } from "./crypto";
import type { GoogleIdentity, TokenInfo } from "./oauth";

export async function assertTeamMailboxAdmin(
  db: Db,
  actorId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const rows = await db.execute(
    sql`SELECT 1 FROM users WHERE id=${actorId} AND is_admin AND is_active`,
  );
  signal.throwIfAborted();
  return rows.rows.length > 0
    ? ok(undefined)
    : err(
        new AppError(
          ERROR_IDS.PERM_TEAM_MAILBOX_ADMIN_REQUIRED,
          "team mailbox administration requires an admin",
          {},
        ),
      );
}

export async function exchangeTeamMailbox(args: {
  db: Db;
  actorId: string;
  code: string;
  backfillDays: number;
  signal: AbortSignal;
  deps: {
    exchangeCode: (code: string, signal: AbortSignal) => Promise<Result<TokenInfo, AppError>>;
    fetchIdentity: (
      accessToken: string,
      signal: AbortSignal,
    ) => Promise<Result<GoogleIdentity, AppError>>;
  };
}): Promise<Result<{ accountId: string }, AppError>> {
  const allowed = await assertTeamMailboxAdmin(args.db, args.actorId, args.signal);
  if (!allowed.ok) return allowed;
  const tokens = await args.deps.exchangeCode(args.code, args.signal);
  args.signal.throwIfAborted();
  if (!tokens.ok) return tokens;
  const identity = await args.deps.fetchIdentity(tokens.value.accessToken, args.signal);
  args.signal.throwIfAborted();
  if (!identity.ok) return identity;
  if (!identity.value.emailVerified || identity.value.hd !== env.GOOGLE_WORKSPACE_DOMAIN) {
    return err(new AppError(ERROR_IDS.AUTH_LOGIN_REJECTED, "gmail identity binding failed", {}));
  }
  const address = identity.value.email.trim().toLowerCase();
  const rows = await args.db.execute(sql`
    INSERT INTO email_accounts (kind, email_address, display_name, connected_by_user_id, backfill_days, refresh_token_enc, scopes)
    VALUES ('team', ${address}, ${address}, ${args.actorId}, ${args.backfillDays}, ${encryptToken(tokens.value.refreshToken)}, ${JSON.stringify(tokens.value.scopes)}::jsonb)
    ON CONFLICT (email_address) DO UPDATE SET refresh_token_enc=EXCLUDED.refresh_token_enc, scopes=EXCLUDED.scopes,
      status='connected', last_error_id=NULL, updated_at=now()
    WHERE email_accounts.kind='team' RETURNING id
  `);
  args.signal.throwIfAborted();
  const row = rows.rows[0] as { id: string } | undefined;
  return row === undefined
    ? err(
        new AppError(
          ERROR_IDS.GMAIL_TEAM_MAILBOX_PERSONAL_COLLISION,
          "address belongs to a personal mailbox",
          {},
        ),
      )
    : ok({ accountId: row.id });
}
