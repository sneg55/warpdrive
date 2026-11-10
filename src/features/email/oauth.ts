import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { encryptToken } from "./crypto";

const PG_UNIQUE_VIOLATION = "23505";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";

export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  scopes: string[];
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  hd: string | null;
}

export function buildAuthUrl(args: { userId: string; state: string; team?: boolean }): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: `${env.BASE_URL}/api/gmail/oauth/callback`,
    response_type: "code",
    access_type: "offline",
    prompt: args.team === true ? "select_account consent" : "consent",
    hd: env.GOOGLE_WORKSPACE_DOMAIN,
    scope: SCOPES.join(" "),
    state: args.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

const norm = (e: string): string => e.trim().toLowerCase();

export function stateMatches(fromQuery: string, fromCookie: string | undefined): boolean {
  if (fromCookie === undefined || fromQuery.length === 0) return false;
  const q = Buffer.from(fromQuery);
  const c = Buffer.from(fromCookie);
  if (q.length !== c.length) return false;
  return timingSafeEqual(q, c);
}

function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let depth = 0; depth < 5 && typeof cur === "object" && cur !== null; depth++) {
    if ("code" in cur) {
      const code = cur.code;
      if (typeof code === "string") return code;
    }
    cur = "cause" in cur ? cur.cause : undefined;
  }
  return undefined;
}

export async function exchangeAndBind(args: {
  db: Db;
  signal: AbortSignal;
  code: string;
  sessionUserId: string;
  sessionEmail: string;
  deps: {
    exchangeCode: (code: string, signal: AbortSignal) => Promise<Result<TokenInfo, AppError>>;
    fetchIdentity: (
      accessToken: string,
      signal: AbortSignal,
    ) => Promise<Result<GoogleIdentity, AppError>>;
  };
}): Promise<Result<{ accountId: string }, AppError>> {
  const tokens = await args.deps.exchangeCode(args.code, args.signal);
  args.signal.throwIfAborted();
  if (!tokens.ok) return tokens;
  const ident = await args.deps.fetchIdentity(tokens.value.accessToken, args.signal);
  args.signal.throwIfAborted();
  if (!ident.ok) return ident;

  const id = ident.value;
  if (
    !id.emailVerified ||
    id.hd !== env.GOOGLE_WORKSPACE_DOMAIN ||
    norm(id.email) !== norm(args.sessionEmail)
  ) {
    return err(new AppError("E_AUTH_001", "gmail identity binding failed", {}));
  }

  const enc = encryptToken(tokens.value.refreshToken);
  try {
    const res = await args.db.execute(sql`
      INSERT INTO email_accounts (user_id, email_address, refresh_token_enc, scopes, status)
      VALUES (${args.sessionUserId}, ${norm(id.email)}, ${enc}, ${JSON.stringify(tokens.value.scopes)}::jsonb, 'connected')
      ON CONFLICT (user_id) DO UPDATE SET
        email_address = EXCLUDED.email_address,
        refresh_token_enc = EXCLUDED.refresh_token_enc,
        scopes = EXCLUDED.scopes,
        status = 'connected',
        last_error_id = NULL,
        updated_at = now()
      RETURNING id
    `);
    args.signal.throwIfAborted();
    const row = res.rows[0] as { id: string } | undefined;
    if (row === undefined) {
      return err(new AppError("E_AUTH_001", "gmail account upsert returned no row", {}));
    }
    return ok({ accountId: row.id });
  } catch (e) {
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
      return err(new AppError("E_GMAIL_006", "gmail address already bound to another user", {}));
    }
    throw e;
  }
}
