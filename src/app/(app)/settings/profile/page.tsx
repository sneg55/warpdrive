import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { users } from "@/db/schema/identity";
import { interfacePrefsFromUi } from "@/features/identity/interfacePrefs";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { SettingsPage } from "../SettingsSurface";
import { InterfacePreferences } from "./InterfacePreferences";
import { ProfileClient } from "./ProfileClient";

export const metadata = { title: STRINGS.settings.profile };

// Personal preferences (Pipedrive "My account"): display name + avatar are editable (avatar via
// the presigned-upload handshake); timezone + interface density persist to user_preferences.
export default async function ProfilePage(): Promise<ReactNode> {
  const { actor } = await createContext();
  if (actor === null)
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAuth}</p>;

  const [[me], prefs] = await Promise.all([
    db
      .select({ name: users.name, email: users.email, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, actor.id)),
    getPreferencesForActor(db, actor.id),
  ]);

  return (
    <SettingsPage>
      <SettingsHeading
        title={STRINGS.settings.profile}
        description={STRINGS.settings.profileDescription}
      />
      <ProfileClient
        name={me?.name ?? ""}
        email={me?.email ?? ""}
        avatarUrl={me?.avatarUrl ?? null}
        timezone={prefs.timezone}
        density={prefs.density}
      />
      <InterfacePreferences
        prefs={interfacePrefsFromUi(prefs.ui)}
        scheduleFollowUpAfterWon={prefs.ui.scheduleFollowUpAfterWon ?? false}
      />
    </SettingsPage>
  );
}
