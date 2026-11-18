import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import { loadLiveSessionByToken, revokeAllSessions } from "./session";

export interface LogoutDeps {
  db: Db;
  sid: string | null;
  signal: AbortSignal;
}

export interface LogoutOk {
  userId: string | null;
}

export async function logoutCore(deps: LogoutDeps): Promise<Result<LogoutOk, never>> {
  const { db, sid, signal } = deps;

  if (sid === null || sid.length === 0) {
    return ok({ userId: null });
  }

  signal.throwIfAborted();

  const session = await loadLiveSessionByToken(db, sid, signal);
  if (session.ok === false) {
    return ok({ userId: null });
  }

  const { userId } = session.value;
  await revokeAllSessions(db, userId, signal);

  return ok({ userId });
}
