import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  X_AUTHORIZE_URL,
  X_OAUTH_INTENT_MAX_AGE,
  X_OAUTH_INTENT_PREFIX,
  X_OAUTH_SCOPES,
} from "@/constants/xDms";
import type { Db } from "@/db/client";
import { assertTeamMailboxAdmin } from "@/features/email/teamMailboxConnect";
import { err, ok, type Result } from "@/types/result";
import { type XDmSettings, xDmSettings } from "./settings";

const VERIFIER_BYTES = 32;

export async function createXOAuthIntent(
  db: Db,
  args: { actorId: string; sessionId: string; settings?: XDmSettings | null },
  signal: AbortSignal,
): Promise<Result<{ state: string; authorizeUrl: string }, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const settings = args.settings === undefined ? xDmSettings() : args.settings;
  if (settings === null)
    return err(new AppError(ERROR_IDS.X_OAUTH_FAILED, "X direct messages are not configured", {}));
  const state = `${X_OAUTH_INTENT_PREFIX}${randomUUID()}`;
  const codeVerifier = randomBytes(VERIFIER_BYTES).toString("base64url");
  const result =
    await db.execute(sql`INSERT INTO x_oauth_intents (state, session_id, code_verifier, expires_at)
    SELECT ${state}, id, ${codeVerifier}, now() + ${X_OAUTH_INTENT_MAX_AGE} * interval '1 second'
    FROM sessions WHERE id=${args.sessionId} AND user_id=${args.actorId} AND revoked_at IS NULL AND expires_at>now() RETURNING state`);
  signal.throwIfAborted();
  if (result.rows.length === 0)
    return err(new AppError(ERROR_IDS.PERM_DENIED, "session not found", {}));
  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", settings.redirectUri);
  url.searchParams.set("scope", X_OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set(
    "code_challenge",
    createHash("sha256").update(codeVerifier).digest("base64url"),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return ok({ state, authorizeUrl: url.toString() });
}

export async function consumeXOAuthIntent(
  db: Db,
  state: string,
  sessionId: string,
  signal: AbortSignal,
): Promise<{ codeVerifier: string } | null> {
  signal.throwIfAborted();
  const result = await db.execute(
    sql`DELETE FROM x_oauth_intents WHERE state=${state} AND session_id=${sessionId} AND expires_at>now() RETURNING code_verifier`,
  );
  signal.throwIfAborted();
  const row = result.rows[0] as { code_verifier: string } | undefined;
  return row === undefined ? null : { codeVerifier: row.code_verifier };
}
