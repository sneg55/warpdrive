import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";

export const SESSION_COOKIE = "wd_sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
}

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
  const token = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(sessions)
    .values({ userId, expiresAt, tokenHash: hashSessionToken(token) })
    .returning();
  signal.throwIfAborted();
  if (row === undefined) return err("failed to create session");
  return ok({ sid: token, sessionId: row.id, expiresAt });
}

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

export function loadLiveSessionByToken(
  db: Db,
  cookieValue: string,
  signal: AbortSignal,
): Promise<Result<{ userId: string; sessionId: string }, "not_found">> {
  return loadLiveSessionWhere(db, eq(sessions.tokenHash, hashSessionToken(cookieValue)), signal);
}

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
