import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Person } from "@/db/schema";
import { persons } from "@/db/schema";
import { canSee } from "@/features/permissions/canSee";
import type { ContactActor } from "./personsRepo";
import { toVisibleRecord } from "./personsRepo";

export interface PersonOption {
  id: string;
  name: string;
}

export interface PersonMatchCandidate extends PersonOption {
  emails: string[];
  phones: string[];
}

function contactValues(primary: string | null, points: Array<{ value: string }>): string[] {
  const all = primary === null ? [] : [primary];
  for (const p of points) all.push(p.value);
  return [...new Set(all.map((v) => v.trim()).filter((v) => v !== ""))];
}

export async function listPersonOptions(
  db: Db,
  actor: ContactActor,
  signal: AbortSignal,
): Promise<PersonOption[]> {
  signal.throwIfAborted();

  const rows = await db
    .select({
      id: persons.id,
      name: persons.name,
      primaryEmail: persons.primaryEmail,
      emails: persons.emails,
      phones: persons.phones,
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

export async function listPersonMatchCandidates(
  db: Db,
  actor: ContactActor,
  signal: AbortSignal,
): Promise<PersonMatchCandidate[]> {
  signal.throwIfAborted();

  const rows = await db
    .select({
      id: persons.id,
      name: persons.name,
      primaryEmail: persons.primaryEmail,
      emails: persons.emails,
      phones: persons.phones,
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
    .map((row) => ({
      id: row.id,
      name: row.name,
      emails: contactValues(row.primaryEmail, row.emails),
      phones: contactValues(null, row.phones),
    }));
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
