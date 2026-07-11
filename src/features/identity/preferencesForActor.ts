import { cache } from "react";
import type { Db } from "@/db/client";
import { getPreferences } from "./preferencesRepo";
import type { Preferences } from "./preferencesSchema";

// Request-scoped cached read of a user's preferences. The (app) layout reads prefs (for interface
// density) on every authenticated page, and most list pages read them again (for saved column
// config), so a naive navigation pays two identical DB queries. Wrapping the read in React.cache
// collapses those into one per render pass, keyed on (db, userId) — mirroring how createContext
// dedupes actor hydration.
//
// The raw getPreferences takes a fresh per-call AbortSignal, which would defeat cache() arg-keying
// (every call site passes a different signal object), so the signal is created inside here instead.
// Outside a React request scope (route handlers, the WS server, the worker, tests) cache() is a
// pass-through, so behaviour there is unchanged.
export const getPreferencesForActor = cache(
  (db: Db, userId: string): Promise<Preferences> =>
    getPreferences(db, userId, AbortSignal.timeout(8000)),
);
