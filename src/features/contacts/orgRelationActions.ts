"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { addOrgRelation, removeOrgRelation } from "./orgRelations";
import {
  type AddOrgRelationInput,
  addOrgRelationInput,
  type RemoveOrgRelationInput,
  removeOrgRelationInput,
} from "./schemas";

type ActionResult = { ok: true } | { ok: false; error: { id: string } };

export async function addOrgRelationAction(
  input: AddOrgRelationInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = addOrgRelationInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.CONTACT_RELATION_INPUT_INVALID } };
  }

  const result = await addOrgRelation(db, actor, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}

export async function removeOrgRelationAction(
  input: RemoveOrgRelationInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = removeOrgRelationInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.CONTACT_RELATION_INPUT_INVALID } };
  }

  const result = await removeOrgRelation(db, actor, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}
