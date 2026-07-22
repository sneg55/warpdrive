import { and, eq, getTableColumns, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Person } from "@/db/schema";
import { persons, users } from "@/db/schema";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { isUuidParam } from "@/lib/isUuidParam";
import { err, ok, type Result } from "@/types/result";
import type { DealVisibilitySession } from "@/types/session";
import { validateContactCustomFields } from "./customFieldsValidation";
import { resolvePersonName, splitName } from "./personName";
import { derivePrimaryEmail } from "./primaryEmail";
import { resolveOwnerUpdate } from "./resolveOwnerUpdate";
import type { PersonCreateInput, PersonUpdateInput } from "./schemas";
import { deriveContactVisibility } from "./visibility";

// ContactActor carries the actor's permission flags (extends PermSetUser) so record
// mutation paths can enforce contact.edit, not just canSee. Dropping flags here was the
// gap behind Codex finding F2 (a visible-but-not-editor user could edit contacts).
export interface ContactActor extends PermSetUser {
  primaryVisibilityGroupId: string | null;
}

// Convert ContactActor to DealVisibilitySession for assertReferenceVisible.
function toRefActor(actor: ContactActor): DealVisibilitySession {
  return {
    userId: actor.id,
    isActive: actor.isActive,
    sessionLive: true,
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

// Build VisiblePersonOrOrg for canSee checks. Exported so deletePerson.ts (a separate file,
// kept small per the file-size convention) can reuse the same canSee/contact.edit gate as
// updatePerson without duplicating the record projection.
export function toVisibleRecord(row: Person): VisiblePersonOrOrg {
  return {
    kind: "person",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId,
    visibleToUserIds: row.visibleToUserIds,
  };
}

export async function createPerson(
  db: Db,
  actor: ContactActor,
  input: PersonCreateInput,
  signal: AbortSignal,
): Promise<Result<Person, AppError>> {
  signal.throwIfAborted();

  const cfResult = await validateContactCustomFields(db, "person", input.customFields, signal, {
    requireImportant: true,
  });
  if (cfResult.ok === false) return cfResult;

  const visResult = await deriveContactVisibility(db, actor, "person", signal);
  if (visResult.ok === false) return visResult;

  const { level, visibilityGroupId } = visResult.value;
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();

    if (input.orgId !== null) {
      const ref = await assertReferenceVisible(
        tx,
        toRefActor(actor),
        { kind: "organization", id: input.orgId },
        signal,
      );
      if (ref.ok === false) return ref;
    }

    // Derive first/last from the combined name when the caller does not supply them
    // explicitly, so every person leaves create with non-stale firstName/lastName (the
    // NULL-first/last state was the root cause of the Finding 1 name-overwrite bug).
    const derivedName = splitName(input.name);

    const [row] = await tx
      .insert(persons)
      .values({
        name: input.name,
        firstName: input.firstName ?? derivedName.firstName,
        lastName: input.lastName ?? derivedName.lastName,
        primaryEmail: derivePrimaryEmail(input.emails),
        emails: input.emails,
        phones: input.phones,
        orgId: input.orgId,
        ownerId: actor.id,
        visibilityLevel: level,
        visibilityGroupId,
        customFields: cfResult.value,
      })
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "insert returned no rows", {}));
    }
    return ok(row);
  });
}

export async function updatePerson(
  db: Db,
  actor: ContactActor,
  input: PersonUpdateInput,
  signal: AbortSignal,
): Promise<Result<Person, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();

    const [current] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.id, input.id), isNull(persons.deletedAt)));

    if (current === undefined || canSee(actor, toVisibleRecord(current)) === false) {
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id: input.id }));
    }
    // Edit capability gate (F2): visibility alone is not authority to mutate.
    // contact.edit is ownership-scoped (_own requires ownership, _any is unconditional).
    if (!can(actor, "contact.edit", toVisibleRecord(current))) {
      return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { id: input.id }));
    }

    const resolvedEmails = (input.emails ?? current.emails).map((e) => ({
      ...e,
      primary: e.primary === true,
    }));

    let resolvedCustomFields: Record<string, unknown> = current.customFields as Record<
      string,
      unknown
    >;
    if (input.customFields !== undefined) {
      const cfResult = await validateContactCustomFields(db, "person", input.customFields, signal);
      if (cfResult.ok === false) return cfResult;
      resolvedCustomFields = cfResult.value;
    }

    const resolvedOrgId = input.orgId === undefined ? current.orgId : input.orgId;

    if (resolvedOrgId !== null && resolvedOrgId !== current.orgId) {
      const ref = await assertReferenceVisible(
        tx,
        toRefActor(actor),
        { kind: "organization", id: resolvedOrgId },
        signal,
      );
      if (ref.ok === false) return ref;
    }

    // Owner transfer (CO-3): gated by deal.changeOwner/admin; ignored otherwise.
    const ownerResult = await resolveOwnerUpdate(tx, actor, input.ownerId, current.ownerId, signal);
    if (ownerResult.ok === false) return ownerResult;

    // See resolvePersonName's docstring for the first/last vs. name precedence rules
    // (Finding 1: a direct `{ name }` edit must re-derive first/last, not leave them stale).
    const resolvedName = resolvePersonName(input, current);

    const [row] = await tx
      .update(persons)
      .set({
        // Guard: never let a derived empty name (e.g. first/last both cleared) overwrite a
        // real one.
        name: resolvedName.name === "" ? current.name : resolvedName.name,
        firstName: resolvedName.firstName,
        lastName: resolvedName.lastName,
        emails: resolvedEmails,
        phones: input.phones ?? current.phones,
        orgId: resolvedOrgId,
        ownerId: ownerResult.value,
        primaryEmail: derivePrimaryEmail(resolvedEmails),
        customFields: resolvedCustomFields,
        // Add-labels (spec B5): omitted -> leave untouched (mirrors deals' coalesce).
        labels: input.labels ?? current.labels,
      })
      .where(and(eq(persons.id, input.id), isNull(persons.deletedAt)))
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "update returned no rows", {}));
    }
    return ok(row);
  });
}

// The full person record plus the resolved owner display name (detail page, Wave 4 Task 5).
// A separate type (not a Person field) because the name only exists via a join to users.
export type PersonDetail = Person & { ownerName: string | null };

export async function getPerson(
  db: Db,
  actor: ContactActor,
  id: string,
  signal: AbortSignal,
): Promise<Result<PersonDetail, AppError>> {
  signal.throwIfAborted();

  // A non-uuid id (a malformed [personId] path param) can never match a row; return the
  // not-found err instead of letting Postgres reject the uuid cast and throw a 500.
  if (!isUuidParam(id)) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id }));
  }

  const [row] = await db
    .select({ ...getTableColumns(persons), ownerName: users.name })
    .from(persons)
    .leftJoin(users, eq(users.id, persons.ownerId))
    .where(and(eq(persons.id, id), isNull(persons.deletedAt)));

  if (row === undefined || canSee(actor, toVisibleRecord(row)) === false) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id }));
  }
  return ok(row);
}

// listPeople (the global contacts-nav list + its Closed-deals count) lives in ./listPeople, and
// listPersonOptions / listPeopleForOrg (lightweight picker/relation projections) live in
// ./personOptionsRepo. Both are split out to keep this file (create/update/get) under the
// file-size limit.
