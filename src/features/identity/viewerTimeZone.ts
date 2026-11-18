import type { Db } from "@/db/client";
import { sqlTimeZone } from "@/lib/sqlTimeZone";
import { getPreferences } from "./preferencesRepo";

export async function viewerTimeZone(
  db: Db,
  userId: string,
  requestZone: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const saved = (await getPreferences(db, userId, signal)).timezone;
  return sqlTimeZone(db, saved ?? requestZone, signal);
}
