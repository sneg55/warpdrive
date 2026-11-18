import { eq } from "drizzle-orm";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import { permissionSets, teamMembers, teams, users, visibilityGroupMembers } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";

export interface HydratedActor extends PermSetUser {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export async function hydrateActor(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<HydratedActor | null> {
  signal.throwIfAborted();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  signal.throwIfAborted();
  if (u === undefined || !u.isActive) return null;

  const flags = new Set<PermissionFlagKey>();
  if (!u.isAdmin && u.permissionSetId !== null) {
    const [ps] = await db
      .select({ flags: permissionSets.flags })
      .from(permissionSets)
      .where(eq(permissionSets.id, u.permissionSetId))
      .limit(1);
    signal.throwIfAborted();
    for (const [k, v] of Object.entries(ps?.flags ?? {})) {
      if (v === true) flags.add(k as PermissionFlagKey);
    }
  }

  const groupRows = await db
    .select({ groupId: visibilityGroupMembers.groupId })
    .from(visibilityGroupMembers)
    .where(eq(visibilityGroupMembers.userId, userId));
  signal.throwIfAborted();

  const managedUserIds = new Set<string>();
  if (flags.has("team.viewMembers")) {
    const managedRows = await db
      .select({ memberId: teamMembers.userId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teams.managerId, userId));
    signal.throwIfAborted();
    for (const r of managedRows) managedUserIds.add(r.memberId);
  }

  return {
    id: u.id,
    type: u.isAdmin ? "admin" : "regular",
    isActive: u.isActive,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    flags,
    groupIds: new Set(groupRows.map((r) => r.groupId)),
    managedUserIds,
  };
}
