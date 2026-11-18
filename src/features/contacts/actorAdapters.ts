import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema/identity";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DealVisibilitySession } from "@/types/session";
import type { ContactActor } from "./personsRepo";

export function toRefActor(actor: PermSetUser): DealVisibilitySession {
  return {
    userId: actor.id,
    isActive: actor.isActive,
    sessionLive: true,
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

export function toContactActor(
  actor: PermSetUser,
  primaryVisibilityGroupId: string | null = null,
): ContactActor {
  return {
    id: actor.id,
    type: actor.type,
    isActive: actor.isActive,
    groupIds: actor.groupIds,
    flags: actor.flags,
    primaryVisibilityGroupId,
  };
}

export async function loadContactActor(
  db: Db,
  actor: PermSetUser,
  signal: AbortSignal,
): Promise<ContactActor> {
  const [urow] = await db
    .select({ primaryGroup: users.primaryVisibilityGroupId })
    .from(users)
    .where(eq(users.id, actor.id));
  signal.throwIfAborted();
  return toContactActor(actor, urow?.primaryGroup ?? null);
}
