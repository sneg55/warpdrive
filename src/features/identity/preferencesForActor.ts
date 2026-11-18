import { cache } from "react";
import type { Db } from "@/db/client";
import { getPreferences } from "./preferencesRepo";
import type { Preferences } from "./preferencesSchema";

export const getPreferencesForActor = cache(
  (db: Db, userId: string): Promise<Preferences> =>
    getPreferences(db, userId, AbortSignal.timeout(8000)),
);
