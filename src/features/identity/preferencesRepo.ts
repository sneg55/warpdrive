import { eq, sql } from "drizzle-orm";
import type { DealSidebarSectionPreference } from "@/constants/dealSidebarSections";
import type { Db } from "@/db/client";
import { userPreferences } from "@/db/schema";
import {
  type Density,
  densitySchema,
  PREFERENCES_DEFAULT,
  type Preferences,
  type UiPrefs,
  uiSchema,
} from "./preferencesSchema";

export async function getPreferences(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<Preferences> {
  signal.throwIfAborted();
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  signal.throwIfAborted();
  if (row === undefined) return { ...PREFERENCES_DEFAULT, ui: {} };

  // Never trust the columns: parse jsonb + text, fall back on invalid stored values.
  const ui = uiSchema.safeParse(row.ui);
  const density = densitySchema.safeParse(row.density);
  return {
    timezone: row.timezone,
    density: density.success ? density.data : PREFERENCES_DEFAULT.density,
    ui: ui.success ? ui.data : {},
  };
}

export async function setSidebarSectionsPreference(
  db: Db,
  userId: string,
  sections: DealSidebarSectionPreference[],
  signal: AbortSignal,
): Promise<void> {
  await setPreferences(db, userId, { ui: { dealSidebarSections: sections } }, signal);
}

export async function setPreferences(
  db: Db,
  userId: string,
  patch: { timezone?: string | null; density?: Density; ui?: UiPrefs },
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const uiPatch = patch.ui ?? {};
  // Merge the jsonb bag server-side (Postgres `||` shallow concat) so concurrent writes
  // to different ui keys cannot lost-update each other. Only the keys named in `patch`
  // touch timezone/density, so a ui-only write never resets the profile scalars.
  const setClause = {
    ui: sql`${userPreferences.ui} || ${JSON.stringify(uiPatch)}::jsonb`,
    ...("timezone" in patch ? { timezone: patch.timezone ?? null } : {}),
    ...(patch.density !== undefined ? { density: patch.density } : {}),
  };

  await db
    .insert(userPreferences)
    .values({
      userId,
      timezone: patch.timezone ?? null,
      density: patch.density ?? PREFERENCES_DEFAULT.density,
      ui: uiPatch,
    })
    .onConflictDoUpdate({ target: userPreferences.userId, set: setClause });
  signal.throwIfAborted();
}
