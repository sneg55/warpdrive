import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { listTeams } from "@/features/identity/teams.service";
import { listAssignableUsers, listUsers } from "@/features/identity/users.service";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { TeamsClient } from "./TeamsClient";
import { TeamsTable } from "./TeamsTable";

export const metadata = { title: STRINGS.settings.teams };

export default async function TeamsPage(): Promise<ReactNode> {
  const { actor, db } = await createContext();
  if (actor === null || (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE))) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }
  const signal = AbortSignal.timeout(5000);
  // Two user lists on purpose: the table resolves an already-set manager's NAME (which may be an
  // inactive/soft-deleted user, so it must use the unfiltered list, or the name would show as
  // "None"), while the create-team pickers must only offer users you can actually assign, so they
  // use the isActive-filtered listAssignableUsers.
  const [teams, userRows, assignableUsers] = await Promise.all([
    listTeams(db, signal),
    listUsers(db, signal),
    listAssignableUsers(db, signal),
  ]);
  const users = userRows.map((u) => ({ id: u.id, name: u.name }));
  const teamRows = teams.map((t) => ({ id: t.id, name: t.name, managerId: t.managerId }));
  return (
    <section>
      <SettingsHeading
        title={STRINGS.settings.teams}
        description={STRINGS.settings.teamsDescription}
      />
      <TeamsTable teams={teamRows} users={users} />
      <TeamsClient users={assignableUsers} />
    </section>
  );
}
