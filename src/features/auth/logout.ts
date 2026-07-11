/**
 * logoutCore: unit-testable core for the /auth/logout route.
 *
 * Responsibilities:
 * 1. Load the session identified by the sid cookie value.
 * 2. If a live session exists, revoke ALL sessions for that user (matches offboarding semantic).
 * 3. Return the userId so the route can clear cookies and redirect to /login.
 * 4. If no live session, return ok with userId null (idempotent: still clears cookies).
 *
 * AbortSignal is required and threaded through every I/O call.
 */

import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import { loadLiveSession, revokeAllSessions } from "./session";

export interface LogoutDeps {
  db: Db;
  sid: string | null;
  signal: AbortSignal;
}

export interface LogoutOk {
  userId: string | null;
}

/**
 * Loads and revokes the session. Always returns ok so callers can proceed to
 * clear cookies and redirect regardless of session state.
 *
 * Operational failures (DB down, timeout) bubble up as thrown errors; the
 * route handler catches them and redirects cleanly without leaking a 500.
 */
export async function logoutCore(deps: LogoutDeps): Promise<Result<LogoutOk, never>> {
  const { db, sid, signal } = deps;

  if (sid === null || sid.length === 0) {
    return ok({ userId: null });
  }

  signal.throwIfAborted();

  const session = await loadLiveSession(db, sid, signal);
  if (session.ok === false) {
    // No live session: idempotent, nothing to revoke.
    return ok({ userId: null });
  }

  const { userId } = session.value;
  await revokeAllSessions(db, userId, signal);

  return ok({ userId });
}
