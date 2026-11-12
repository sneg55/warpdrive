import type { Db } from "@/db/client";
import { resolveTimeZone } from "@/lib/localDayRange";
import { getPreferences } from "./preferencesRepo";

export async function viewerTimeZone(
  db: Db,
  userId: string,
  requestZone: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const saved = (await getPreferences(db, userId, signal)).timezone;
  return resolveTimeZone(saved ?? requestZone);
}
