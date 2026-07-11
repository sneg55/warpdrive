import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";

export const SESSION_COOKIE = "wd_sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days absolute expiry.

export function sessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
}

export async function createSession(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<Result<{ sid: string; expiresAt: Date }, string>> {
  signal.throwIfAborted();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [row] = await db.insert(sessions).values({ userId, expiresAt }).returning();
  signal.throwIfAborted();
  if (row === undefined) return err("failed to create session");
  return ok({ sid: row.id, expiresAt });
}

// Live iff revoked_at IS NULL AND expires_at > now() AND user.is_active (data-model sessions).
export async function loadLiveSession(
  db: Db,
  sid: string,
  signal: AbortSignal,
): Promise<Result<{ userId: string; sessionId: string }, "not_found">> {
  signal.throwIfAborted();
  const rows = await db
    .select({ userId: sessions.userId, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, sid),
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

export async function revokeAllSessions(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
  signal.throwIfAborted();
}
