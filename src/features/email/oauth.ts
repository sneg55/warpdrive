import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { encryptToken } from "./crypto";

// Postgres unique_violation. A second user binding an address already connected to
// another user trips email_accounts.email_address UNIQUE.
const PG_UNIQUE_VIOLATION = "23505";

// openid + email are REQUIRED, not optional: the callback resolves the mailbox owner
// via Google's userinfo endpoint (see route.ts), which returns email / email_verified /
// hd only when the access token carries an OIDC identity scope. Requesting the Gmail
// scopes alone makes userinfo 403, so the connect silently fails with no mailbox stored.
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

// Single-use, HttpOnly cookie holding the OAuth state value for login-CSRF defense.
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

// Gmail-specific consent URL. Distinct from the LOGIN flow in auth/google.ts:
// broader scopes, the Gmail callback redirect, offline access, and forced consent
// so Google always returns a refresh token.
export function buildAuthUrl(args: { userId: string; state: string }): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: `${env.BASE_URL}/api/gmail/oauth/callback`,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    hd: env.GOOGLE_WORKSPACE_DOMAIN,
    scope: SCOPES.join(" "),
    state: args.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

// Normalize email for comparison and storage: trim + lowercase.
const norm = (e: string): string => e.trim().toLowerCase();

// Constant-time compare of the OAuth state from the query vs the single-use cookie
// (login-CSRF mitigation). A missing cookie or any length/value mismatch is false.
// An empty query state is never a match (a blank cookie must not authorize).
export function stateMatches(fromQuery: string, fromCookie: string | undefined): boolean {
  if (fromCookie === undefined || fromQuery.length === 0) return false;
  const q = Buffer.from(fromQuery);
  const c = Buffer.from(fromCookie);
  if (q.length !== c.length) return false;
  return timingSafeEqual(q, c);
}

// Narrow an unknown thrown value to a Postgres error code. Drizzle wraps the pg
// error in its own Error and hangs the original off `.cause`, so walk the cause
// chain. Lets us catch the unique violation distinctly.
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

// Security core: exchange the code, fetch the Google identity, and bind the
// mailbox to the signed-in user ONLY when the identity is verified, in our
// workspace domain, and addresses the same account. Any mismatch rejects with
// E_AUTH_001 and writes NO token. deps inject the HTTP layer so it is fakeable;
// the DB write always hits real Postgres.
export async function exchangeAndBind(args: {
  db: Db;
  code: string;
  sessionUserId: string;
  sessionEmail: string;
  deps: {
    exchangeCode: (code: string) => Promise<Result<TokenInfo, AppError>>;
    fetchIdentity: (accessToken: string) => Promise<Result<GoogleIdentity, AppError>>;
  };
}): Promise<Result<{ accountId: string }, AppError>> {
  const tokens = await args.deps.exchangeCode(args.code);
  if (!tokens.ok) return tokens;
  const ident = await args.deps.fetchIdentity(tokens.value.accessToken);
  if (!ident.ok) return ident;

  const id = ident.value;
  if (
    !id.emailVerified ||
    id.hd !== env.GOOGLE_WORKSPACE_DOMAIN ||
    norm(id.email) !== norm(args.sessionEmail)
  ) {
    // NO token stored. Do not log the token or the rejected identity address.
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
    const row = res.rows[0] as { id: string } | undefined;
    if (row === undefined) {
      return err(new AppError("E_AUTH_001", "gmail account upsert returned no row", {}));
    }
    return ok({ accountId: row.id });
  } catch (e) {
    // The ON CONFLICT targets user_id, so a collision on the separate
    // email_address UNIQUE means this Gmail address is already bound to a
    // DIFFERENT user. Surface it as a value, never a 500; the other user's row
    // is left untouched. Do not log token contents.
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
      return err(new AppError("E_GMAIL_006", "gmail address already bound to another user", {}));
    }
    throw e;
  }
}
