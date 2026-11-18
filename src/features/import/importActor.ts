import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema/identity";
import type { PermSetUser } from "@/features/permissions/effective";
import { hydrateActor } from "@/server/hydrateActor";
import type { ImportActor } from "./commit";

export function toImportActor(
  actor: PermSetUser,
  primaryVisibilityGroupId: string | null = null,
): ImportActor {
  return { ...actor, primaryVisibilityGroupId };
}

export async function loadImportActor(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<ImportActor | null> {
  const actor = await hydrateActor(db, userId, signal);
  if (actor === null) return null;
  const [urow] = await db
    .select({ primaryGroup: users.primaryVisibilityGroupId })
    .from(users)
    .where(eq(users.id, userId));
  signal.throwIfAborted();
  return toImportActor(actor, urow?.primaryGroup ?? null);
}
