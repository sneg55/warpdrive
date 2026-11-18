import { and, eq, getTableColumns, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Person } from "@/db/schema";
import { persons, users } from "@/db/schema";
import { syncEntityLabelNames } from "@/features/labels/labelsRepo.entities";
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

export interface ContactActor extends PermSetUser {
  primaryVisibilityGroupId: string | null;
}

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

export type PersonEditAuthority = "requires-contact-edit" | "actor-just-created-this-person";

export async function updatePerson(
  db: Db,
  actor: ContactActor,
  input: PersonUpdateInput,
  signal: AbortSignal,
  authority: PersonEditAuthority = "requires-contact-edit",
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
    if (
      authority === "requires-contact-edit" &&
      !can(actor, "contact.edit", toVisibleRecord(current))
    ) {
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

    const ownerResult = await resolveOwnerUpdate(tx, actor, input.ownerId, current.ownerId, signal);
    if (ownerResult.ok === false) return ownerResult;

    const resolvedName = resolvePersonName(input, current);

    const [row] = await tx
      .update(persons)
      .set({
        name: resolvedName.name === "" ? current.name : resolvedName.name,
        firstName: resolvedName.firstName,
        lastName: resolvedName.lastName,
        emails: resolvedEmails,
        phones: input.phones ?? current.phones,
        orgId: resolvedOrgId,
        ownerId: ownerResult.value,
        primaryEmail: derivePrimaryEmail(resolvedEmails),
        customFields: resolvedCustomFields,
        labels: input.labels ?? current.labels,
      })
      .where(and(eq(persons.id, input.id), isNull(persons.deletedAt)))
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "update returned no rows", {}));
    }
    if (input.labels !== undefined) {
      await syncEntityLabelNames(tx, "person", row.id, row.labels, signal);
    }
    return ok(row);
  });
}

export type PersonDetail = Person & { ownerName: string | null };

export async function getPerson(
  db: Db,
  actor: ContactActor,
  id: string,
  signal: AbortSignal,
): Promise<Result<PersonDetail, AppError>> {
  signal.throwIfAborted();

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
