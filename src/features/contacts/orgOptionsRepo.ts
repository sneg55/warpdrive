import { isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { canSee } from "@/features/permissions/canSee";
import type { ContactActor } from "./personsRepo";

// Every visible organization as a lightweight {id,name} option, name-sorted, with no pagination cap
// (mirrors listPersonOptions). Feeds the Add deal/lead organization combobox. Split out of orgsRepo
// to keep that file under the size budget.
export async function listOrgOptions(
  db: Db,
  actor: ContactActor,
  signal: AbortSignal,
): Promise<Array<{ id: string; name: string }>> {
  signal.throwIfAborted();

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      ownerId: organizations.ownerId,
      visibilityLevel: organizations.visibilityLevel,
      visibilityGroupId: organizations.visibilityGroupId,
      visibleToUserIds: organizations.visibleToUserIds,
    })
    .from(organizations)
    .where(isNull(organizations.deletedAt))
    .orderBy(organizations.name, organizations.id);
  signal.throwIfAborted();

  return rows
    .filter((row) => canSee(actor, { kind: "organization", ...row }))
    .map((row) => ({ id: row.id, name: row.name }));
}
