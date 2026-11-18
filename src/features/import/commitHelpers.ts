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

export type ImportActor = ContactActor & PermSetUser;

export type RowError = { field: string; message: string };
export type Commit = {
  status: ImportRowStatus;
  entityId: string | null;
  warnings: RowError[];
};

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

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function issuesOf(error: ZodError): RowError[] {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}

export function authorityError(error: AppError): RowError[] {
  return [{ field: "_", message: error.id }];
}

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

export async function applyCreate(
  tx: Tx,
  actor: ImportActor,
  target: "person" | "organization",
  mapped: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
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

export async function finalize(
  tx: Tx,
  rowId: string,
  status: ImportRowStatus,
  entityId: string | null,
  errors: RowError[],
  side: SideEffects = noSideEffects,
  warnings: RowError[] = [],
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
      warnings,
    })
    .where(sql`${importRows.id} = ${rowId}`)
    .returning({ id: importRows.id });
  if (updated.length === 0) {
    return err(new AppError(ERROR_IDS.IMPORT_ROW_GONE, "row gone during finalize", { rowId }));
  }
  return ok({ status, entityId, warnings });
}
