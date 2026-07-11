import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { listTeamMembers, listTeams } from "@/features/identity/teams.service";
import { listAssignableUsers } from "@/features/identity/users.service";
import { createContext } from "@/server/trpc/context";
import { TeamEditClient } from "./TeamEditClient";

export const metadata = { title: STRINGS.settings.teams };

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<ReactNode> {
  const { teamId } = await params;
  const { actor, db } = await createContext();
  if (actor === null || (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE))) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }

  const signal = AbortSignal.timeout(5000);
  const teams = await listTeams(db, signal);
  const team = teams.find((t) => t.id === teamId);
  if (team === undefined) notFound();

  const [members, assignableUsers] = await Promise.all([
    listTeamMembers(db, teamId, signal),
    listAssignableUsers(db, signal),
  ]);

  return (
    <section>
      <Link href="/settings/teams" className="text-sm text-blue-600 hover:underline">
        &larr; {STRINGS.settings.teams}
      </Link>
      <TeamEditClient
        teamId={teamId}
        name={team.name}
        managerId={team.managerId}
        members={members}
        assignableUsers={assignableUsers}
      />
    </section>
  );
}
