import { asc, isNull } from "drizzle-orm";
import type { ReactNode } from "react";
import { SETTINGS_STRINGS } from "@/constants/settingsStrings";
import { activityTypes, teams } from "@/db/schema";
import { goals } from "@/db/schema/goals";
import { listAssignableUsers } from "@/features/identity/users.service";
import { can } from "@/features/permissions/can";
import { visiblePipelineOptions } from "@/features/stats/visiblePipelines";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { SettingsPage } from "../SettingsSurface";
import { GoalsClient } from "./GoalsClient";

export const metadata = { title: SETTINGS_STRINGS.goals };

export default async function GoalsSettingsPage(): Promise<ReactNode> {
  const { actor, db } = await createContext();
  // Reading a goal needs no permission; setting someone's quota is administrative, so this
  // screen is gated even though the Performance widget is not.
  if (actor === null || !can(actor, "goals.manage")) {
    return <p className="text-sm text-red-600">{SETTINGS_STRINGS.requiresAdmin}</p>;
  }
  const signal = AbortSignal.timeout(5000);
  const [goalRows, users, teamRows, pipelineRows, typeRows] = await Promise.all([
    db.select().from(goals).where(isNull(goals.deletedAt)).orderBy(asc(goals.startsOn)),
    listAssignableUsers(db, signal),
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(asc(teams.name)),
    // Gated, not a raw select: a restricted pipeline's name must not reach a non-admin who
    // happens to hold goals.manage, and an archived pipeline can never accrue progress.
    visiblePipelineOptions(db, actor, signal),
    db
      .select({ id: activityTypes.id, name: activityTypes.name })
      .from(activityTypes)
      .where(isNull(activityTypes.archivedAt))
      .orderBy(asc(activityTypes.order)),
  ]);

  return (
    <SettingsPage>
      <SettingsHeading
        title={SETTINGS_STRINGS.goals}
        description={SETTINGS_STRINGS.goalsDescription}
      />
      <GoalsClient
        goals={goalRows}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        teams={teamRows}
        pipelines={pipelineRows}
        activityTypes={typeRows}
      />
    </SettingsPage>
  );
}
