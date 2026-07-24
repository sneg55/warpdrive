import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";

export const SESSION_COOKIE = "wd_sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days absolute expiry.

export function sessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
}

// The cookie value is a bearer credential, so only its digest is stored. Plain sha256, with no
// salt and no KDF, is the right construction here and not an oversight: the input is 256 bits of
// CSPRNG output rather than a human-chosen secret, so there is no dictionary to attack and
// nothing for a work factor to slow down. Same shape the OAuth auth codes and refresh tokens in
// this codebase already use.
function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<Result<{ sid: string; sessionId: string; expiresAt: Date }, string>> {
  signal.throwIfAborted();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  // 256 bits, generated independently of the row id: the id stays an internal handle, this is
  // the secret. Previously the two were the same value, so anything that saw one held the other.
  const token = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(sessions)
    .values({ userId, expiresAt, tokenHash: hashSessionToken(token) })
    .returning();
  signal.throwIfAborted();
  if (row === undefined) return err("failed to create session");
  return ok({ sid: token, sessionId: row.id, expiresAt });
}

// Live iff revoked_at IS NULL AND expires_at > now() AND user.is_active (data-model sessions).
async function loadLiveSessionWhere(
  db: Db,
  match: SQL | undefined,
  signal: AbortSignal,
): Promise<Result<{ userId: string; sessionId: string }, "not_found">> {
  signal.throwIfAborted();
  const rows = await db
    .select({ userId: sessions.userId, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        match,
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  signal.throwIfAborted();
  const row = rows[0];
  if (row === undefined) return err("not_found");
  return ok({ userId: row.userId, sessionId: row.sessionId });
}

/**
 * Resolve a session from the wd_sid COOKIE value. This is the authentication path: a caller
 * presented a bearer credential and this decides whether it is good.
 */
export function loadLiveSessionByToken(
  db: Db,
  cookieValue: string,
  signal: AbortSignal,
): Promise<Result<{ userId: string; sessionId: string }, "not_found">> {
  return loadLiveSessionWhere(db, eq(sessions.tokenHash, hashSessionToken(cookieValue)), signal);
}

/**
 * Resolve a session from its INTERNAL id. Not an authentication step: the caller already
 * established who it is by other means and only needs to know whether the session is still live.
 * Used by the WS heartbeat, which holds the session id carried in a verified ticket, not a cookie.
 *
 * Deliberately separate from the token lookup. A single function taking "a session identifier"
 * would make it easy to accept an internal id where a credential is required, which would turn
 * every place that id legitimately appears (a ticket payload, a log line) into a session token.
 */
export function loadLiveSessionById(
  db: Db,
  sessionId: string,
  signal: AbortSignal,
): Promise<Result<{ userId: string; sessionId: string }, "not_found">> {
  return loadLiveSessionWhere(db, eq(sessions.id, sessionId), signal);
}

export async function revokeAllSessions(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
  signal.throwIfAborted();
}
