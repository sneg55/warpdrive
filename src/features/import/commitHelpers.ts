import { sql } from "drizzle-orm";
import type { ZodError } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { ImportRowStatus } from "@/constants/importStatus";
import type { Db } from "@/db/client";
import { importRows } from "@/db/schema";
import { createOrg, updateOrg } from "@/features/contacts/orgsRepo";
import { type ContactActor, createPerson, updatePerson } from "@/features/contacts/personsRepo";
import {
  orgCreateInput,
  orgUpdateInput,
  personCreateInput,
  personUpdateInput,
} from "@/features/contacts/schemas";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import type { EntityCreateSession } from "@/features/permissions/entityCreate";
import { err, ok, type Result } from "@/types/result";

// An import actor must satisfy BOTH createPerson's ContactActor (owner +
// visibility derivation) AND can()'s PermSetUser (permission-flag checks).
export type ImportActor = ContactActor & PermSetUser;

export type Commit = { status: ImportRowStatus; entityId: string | null };
export type RowError = { field: string; message: string };

// Records a row created ALONGSIDE its primary entity. Each stays null when the row linked to a
// pre-existing record instead of creating one, which is exactly the distinction undo needs: it
// removes what the import created and leaves what the import merely linked to.
export interface SideEffects {
  createdOrgId: string | null;
  createdPersonId: string | null;
  createdNoteId: string | null;
}

export const noSideEffects: SideEffects = {
  createdOrgId: null,
  createdPersonId: null,
  createdNoteId: null,
};

// drizzle nests db.transaction inside the outer commit tx as a SAVEPOINT, so the
// audited create/update authorities run atomically within the row commit while
// still deriving owner + visibility from settings and validating custom fields.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Map a Zod failure to row-level errors so commitRow can finalize "invalid"
// deterministically (a malformed mapped row must never throw an opaque DB error
// that rolls back the claim and loops the row forever). Exported so the deal/lead/
// activity commit authorities (commitDeal.ts etc.) share the same mapping.
export function issuesOf(error: ZodError): RowError[] {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}

// Map a failed authority Result to a single row error carrying its stable id.
export function authorityError(error: AppError): RowError[] {
  return [{ field: "_", message: error.id }];
}

// Build the deal/lead creation trust-boundary session from an import actor. Mirrors
// createDealAction's flags conversion (Set -> Record) but reuses ImportActor's own
// primaryVisibilityGroupId directly instead of a redundant DB lookup.
export function toEntityCreateSession(actor: ImportActor): EntityCreateSession {
  const flags: Record<string, boolean> = {};
  for (const f of actor.flags) flags[f] = true;
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
    primaryVisibilityGroupId: actor.primaryVisibilityGroupId,
    flags,
  };
}

// CREATE path: parse mapped through the SAME boundary schema the API uses, then
// reuse the audited authority so imported records get identical treatment to
// API-created ones (owner = actor, visibility from settings, custom fields
// validated). err arm -> commitRow finalizes "invalid" cleanly.
export async function applyCreate(
  tx: Tx,
  actor: ImportActor,
  target: "person" | "organization",
  mapped: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  // createPerson/createOrg have no internal create-capability gate (unlike createDeal/
  // createLead), and commitRow bypasses createPersonAction/createOrgAction where the
  // contact.create check normally lives. Enforce it here so a data.import user without
  // contact.create cannot create contacts via import. Mirrors applyCreateActivity.
  if (can(actor, "contact.create") === false) {
    return err(authorityError(new AppError(ERROR_IDS.PERM_DENIED, "contact.create required", {})));
  }
  if (target === "person") {
    const parsed = personCreateInput.safeParse(mapped);
    if (parsed.success === false) return err(issuesOf(parsed.error));
    const result = await createPerson(tx, actor, parsed.data, signal);
    if (result.ok === false) return err(authorityError(result.error));
    return ok(result.value.id);
  }
  const parsed = orgCreateInput.safeParse(mapped);
  if (parsed.success === false) return err(issuesOf(parsed.error));
  const result = await createOrg(tx, actor, parsed.data, signal);
  if (result.ok === false) return err(authorityError(result.error));
  return ok(result.value.id);
}

// UPDATE path: parse { ...mapped, id } through the boundary schema, then reuse
// the audited authority (re-derives primaryEmail, validates custom fields,
// re-checks canSee). err arm -> commitRow finalizes "invalid" cleanly.
export async function applyUpdate(
  tx: Tx,
  actor: ImportActor,
  target: "person" | "organization",
  candidateId: string,
  mapped: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  if (target === "person") {
    const parsed = personUpdateInput.safeParse({ ...mapped, id: candidateId });
    if (parsed.success === false) return err(issuesOf(parsed.error));
    const result = await updatePerson(tx, actor, parsed.data, signal);
    if (result.ok === false) return err(authorityError(result.error));
    return ok(result.value.id);
  }
  const parsed = orgUpdateInput.safeParse({ ...mapped, id: candidateId });
  if (parsed.success === false) return err(issuesOf(parsed.error));
  const result = await updateOrg(tx, actor, parsed.data, signal);
  if (result.ok === false) return err(authorityError(result.error));
  return ok(result.value.id);
}

// Terminal write for a row in the SAME transaction as claim + dedup + apply. The side effects are
// the org/person/note this row created (null where it linked to a pre-existing record); they are
// persisted so undo can remove them too.
export async function finalize(
  tx: Tx,
  rowId: string,
  status: ImportRowStatus,
  entityId: string | null,
  errors: RowError[],
  side: SideEffects = noSideEffects,
): Promise<Result<Commit, AppError>> {
  const updated = await tx
    .update(importRows)
    .set({
      status,
      createdEntityId: entityId,
      createdOrgId: side.createdOrgId,
      createdPersonId: side.createdPersonId,
      createdNoteId: side.createdNoteId,
      errors,
    })
    .where(sql`${importRows.id} = ${rowId}`)
    .returning({ id: importRows.id });
  if (updated.length === 0) {
    return err(new AppError(ERROR_IDS.IMPORT_ROW_GONE, "row gone during finalize", { rowId }));
  }
  return ok({ status, entityId });
}
