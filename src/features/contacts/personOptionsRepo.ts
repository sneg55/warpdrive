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

// Same visible set, plus the contact points the deal Person panel matches a typed draft against.
// Deliberately separate from PersonOption: that one is serialized to the client by the shared
// contacts.personOptions picker endpoint (Add deal/lead and friends), which needs no contact data,
// and this list is unpaginated, so folding the arrays in there would grow every picker payload.
export interface PersonMatchCandidate extends PersonOption {
  emails: string[];
  phones: string[];
}

// The primary address lives in its own column and may or may not be repeated in the JSONB array, so
// fold both into one deduped list without letting a blank through.
function contactValues(primary: string | null, points: Array<{ value: string }>): string[] {
  const all = primary === null ? [] : [primary];
  for (const p of points) all.push(p.value);
  return [...new Set(all.map((v) => v.trim()).filter((v) => v !== ""))];
}

// Every visible person as a lightweight {id,name} option, name-sorted, with no pagination cap. The
// Add deal/lead comboboxes need the full visible set (to select and to duplicate-check) rather than
// a 500-row page; projecting to id+name keeps the payload small even on large instances.
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

// Match candidates for the deal Person panel: the same visibility gate, carrying contact points so
// a half-typed email or phone can identify an existing contact (see personMatch). Loaded only for a
// deal that has no linked person, since a linked one never opens the editor.
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
