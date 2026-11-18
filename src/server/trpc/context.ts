import { cookies } from "next/headers";
import { cache } from "react";
import { type Db, db } from "@/db/client";
import { loadLiveSessionByToken, SESSION_COOKIE } from "@/features/auth/session";
import { type HydratedActor, hydrateActor } from "@/server/hydrateActor";

export interface AppContext {
  db: Db;
  session: { userId: string; sessionId: string } | null;
  actor: HydratedActor | null;
}

export const createContext = cache(async (): Promise<AppContext> => {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  if (sid === null) return { db, session: null, actor: null };

  const signal = AbortSignal.timeout(5000);
  const live = await loadLiveSessionByToken(db, sid, signal);
  if (!live.ok) return { db, session: null, actor: null };

  const actor = await hydrateActor(db, live.value.userId, signal);
  return { db, session: live.value, actor };
});
