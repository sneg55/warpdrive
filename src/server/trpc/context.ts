import { cookies } from "next/headers";
import { cache } from "react";
import { type Db, db } from "@/db/client";
import { loadLiveSession, SESSION_COOKIE } from "@/features/auth/session";
import { type HydratedActor, hydrateActor } from "@/server/hydrateActor";

export interface AppContext {
  db: Db;
  session: { userId: string; sessionId: string } | null;
  actor: HydratedActor | null;
}

/**
 * Resolve the caller from the session cookie. Costs a session lookup plus actor hydration
 * (user row, permission set, visibility groups).
 *
 * Wrapped in React.cache so a layout, a nested layout, and the page share one hydration per
 * request rather than each paying for its own: /settings/users measured 3 session reads before
 * and 1 after. Outside a React request scope (route handlers, the WS server, the worker, tests)
 * cache() is a pass-through, so behaviour there is unchanged.
 */
export const createContext = cache(async (): Promise<AppContext> => {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  if (sid === null) return { db, session: null, actor: null };

  // One timeout signal for the whole context build so it is cancellable end to end.
  const signal = AbortSignal.timeout(5000);
  const live = await loadLiveSession(db, sid, signal);
  if (!live.ok) return { db, session: null, actor: null };

  const actor = await hydrateActor(db, live.value.userId, signal);
  return { db, session: live.value, actor };
});
