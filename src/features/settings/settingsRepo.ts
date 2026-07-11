import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type Settings, settings } from "@/db/schema/system";

// The settings singleton is guarded by CHECK (id = true); every write targets that one row.
// upsert so a fresh install (no row yet) still lands the patch.
export interface SettingsPatch {
  companyName?: string | null;
  emailTrackingDefaultEnabled?: boolean;
}

export async function updateSettings(
  db: Db,
  patch: SettingsPatch,
  signal: AbortSignal,
): Promise<Settings> {
  signal.throwIfAborted();
  const set: Partial<typeof settings.$inferInsert> = {};
  if ("companyName" in patch) set.companyName = patch.companyName ?? null;
  if (patch.emailTrackingDefaultEnabled !== undefined) {
    set.emailTrackingDefaultEnabled = patch.emailTrackingDefaultEnabled;
  }

  const [row] = await db
    .insert(settings)
    .values({ id: true, ...set })
    .onConflictDoUpdate({ target: settings.id, set })
    .returning();
  signal.throwIfAborted();
  if (row === undefined) {
    // The singleton always yields a row on upsert; re-read defensively.
    const [existing] = await db.select().from(settings).where(eq(settings.id, true));
    if (existing === undefined) {
      throw new AppError(ERROR_IDS.DB_INVARIANT, "settings singleton missing after upsert", {});
    }
    return existing;
  }
  return row;
}
