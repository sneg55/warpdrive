import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import type { ContactActor } from "@/features/contacts/personsRepo";
import type { PermSetUser } from "@/features/permissions/effective";
import type { EntityCreateSession } from "@/features/permissions/entityCreate";
import type { AuthUser } from "@/features/permissions/types";
import type { HydratedActor } from "@/server/hydrateActor";
import type { AppContext } from "@/server/trpc/context";

async function primaryVisibilityGroupId(
  db: Db,
  actorId: string,
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted();
  const [user] = await db
    .select({ primaryVisibilityGroupId: users.primaryVisibilityGroupId })
    .from(users)
    .where(eq(users.id, actorId));
  signal.throwIfAborted();
  return user?.primaryVisibilityGroupId ?? null;
}

export function buildAppContext(db: Db, actor: HydratedActor): AppContext {
  return {
    db,
    actor,
    session: { userId: actor.id, sessionId: `mcp:${actor.id}` },
  };
}

export function toAuthUser(actor: HydratedActor): AuthUser {
  return {
    id: actor.id,
    type: actor.type,
    isActive: actor.isActive,
    groupIds: actor.groupIds,
    managedUserIds: actor.managedUserIds,
  };
}

export function toPermSetUser(actor: HydratedActor): PermSetUser {
  return { ...toAuthUser(actor), flags: actor.flags };
}

export async function buildContactActor(
  db: Db,
  actor: HydratedActor,
  signal: AbortSignal,
): Promise<ContactActor> {
  return {
    ...toPermSetUser(actor),
    primaryVisibilityGroupId: await primaryVisibilityGroupId(db, actor.id, signal),
  };
}

export async function buildEntityCreateSession(
  db: Db,
  actor: HydratedActor,
  signal: AbortSignal,
): Promise<EntityCreateSession> {
  const flags: Record<string, boolean> = {};
  for (const flag of actor.flags) flags[flag] = true;

  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
    primaryVisibilityGroupId: await primaryVisibilityGroupId(db, actor.id, signal),
    flags,
  };
}
