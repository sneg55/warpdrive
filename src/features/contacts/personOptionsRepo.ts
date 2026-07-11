import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Person } from "@/db/schema";
import { persons } from "@/db/schema";
import { canSee } from "@/features/permissions/canSee";
import type { ContactActor } from "./personsRepo";
import { toVisibleRecord } from "./personsRepo";

// Every visible person as a lightweight {id,name} option, name-sorted, with no pagination cap. The
// Add deal/lead comboboxes need the full visible set (to select and to duplicate-check) rather than
// a 500-row page; projecting to id+name keeps the payload small even on large instances.
export async function listPersonOptions(
  db: Db,
  actor: ContactActor,
  signal: AbortSignal,
): Promise<Array<{ id: string; name: string }>> {
  signal.throwIfAborted();

  const rows = await db
    .select({
      id: persons.id,
      name: persons.name,
      ownerId: persons.ownerId,
      visibilityLevel: persons.visibilityLevel,
      visibilityGroupId: persons.visibilityGroupId,
      visibleToUserIds: persons.visibleToUserIds,
    })
    .from(persons)
    .where(isNull(persons.deletedAt))
    .orderBy(persons.name, persons.id);
  signal.throwIfAborted();

  return rows
    .filter((row) => canSee(actor, { kind: "person", ...row }))
    .map((row) => ({ id: row.id, name: row.name }));
}

export async function listPeopleForOrg(
  db: Db,
  actor: ContactActor,
  orgId: string,
  signal: AbortSignal,
): Promise<Person[]> {
  signal.throwIfAborted();

  const rows = await db
    .select()
    .from(persons)
    .where(and(eq(persons.orgId, orgId), isNull(persons.deletedAt)));

  return rows.filter((row) => canSee(actor, toVisibleRecord(row)));
}
