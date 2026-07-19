import { eq } from "drizzle-orm";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import { permissionSets, teamMembers, teams, users, visibilityGroupMembers } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";

// A hydrated actor plus the display fields already present on the user row hydrateActor reads.
// Exposing them here lets the app shell render the avatar from ctx.actor instead of re-reading the
// same users row per authenticated page. HydratedActor extends PermSetUser, so every permissions
// call site that expects a PermSetUser is unaffected.
export interface HydratedActor extends PermSetUser {
  name: string;
  avatarUrl: string | null;
}

// Build a HydratedActor from a userId with no request/session context. Used by
// createContext (request path) AND by import background jobs (no cookies available),
// so it takes db explicitly and never imports next/headers.
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

  // Team-manager view: only when the actor holds team.viewMembers do we load the members of teams
  // they manage. Membership in this set is what grants team-scoped visibility/edit (canSee/can),
  // so gating it here is the single enforcement point for the view grant.
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
    avatarUrl: u.avatarUrl,
    flags,
    groupIds: new Set(groupRows.map((r) => r.groupId)),
    managedUserIds,
  };
}
