"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";
import { loadContactActor, toContactActor } from "./actorAdapters";
import {
  type ContactCustomFieldPatchInput,
  contactCustomFieldPatchInput,
  patchContactCustomField,
} from "./contactCustomFieldPatch";
import { deleteOrg } from "./deleteOrg";
import { deletePerson } from "./deletePerson";
import { type MergeArgs, mergeOrgs, mergePersons } from "./merge";
import { createOrg, updateOrg } from "./orgsRepo";
import { createPerson, updatePerson } from "./personsRepo";
import {
  type OrgCreateInput,
  type OrgUpdateInput,
  orgDeleteInput,
  orgUpdateInput,
  type PersonCreateInput,
  type PersonUpdateInput,
  personDeleteInput,
  personUpdateInput,
} from "./schemas";

type ActionResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

export async function patchContactCustomFieldAction(
  input: ContactCustomFieldPatchInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = contactCustomFieldPatchInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.CONTACT_UPDATE_INPUT_INVALID } };
  }
  const result = await patchContactCustomField(db, toContactActor(actor), parsed.data, SIG());
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, error: { id: result.error.id } };
}

export async function createPersonAction(
  input: PersonCreateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  if (!can(actor, "contact.create")) {
    return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };
  }

  const result = await createPerson(db, await loadContactActor(db, actor, SIG()), input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function updatePersonAction(
  input: PersonUpdateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = personUpdateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.CONTACT_UPDATE_INPUT_INVALID } };
  }

  // Record-scoped: updatePerson gates visibility/edit internally. No double gate.
  const result = await updatePerson(db, toContactActor(actor), parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function deletePersonAction(
  input: { id: string },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // A malformed id can never match a row; 404-shape it the same way a genuinely missing/
  // invisible id would (isUuidParam does the same in getPerson) instead of a distinct
  // validation error, so a stranger learns nothing either way.
  const parsed = personDeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CONTACT_NOT_FOUND } };

  // Record-scoped: deletePerson gates visibility/delete internally. No double gate.
  const result = await deletePerson(db, toContactActor(actor), parsed.data.id, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function createOrgAction(
  input: OrgCreateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  if (!can(actor, "contact.create")) {
    return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };
  }

  const result = await createOrg(db, await loadContactActor(db, actor, SIG()), input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function updateOrgAction(
  input: OrgUpdateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = orgUpdateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.CONTACT_UPDATE_INPUT_INVALID } };
  }

  const result = await updateOrg(db, toContactActor(actor), parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function deleteOrgAction(
  input: { id: string },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // A malformed id can never match a row; 404-shape it the same way a genuinely missing/
  // invisible id would (isUuidParam does the same in getOrg) instead of a distinct
  // validation error, so a stranger learns nothing either way.
  const parsed = orgDeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CONTACT_NOT_FOUND } };

  // Record-scoped: deleteOrg gates visibility/delete internally. No double gate.
  const result = await deleteOrg(db, toContactActor(actor), parsed.data.id, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function mergePersonsAction(
  input: MergeArgs,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // Record-scoped: gateMerge inside mergePersons handles visibility + contact.merge.
  const result = await mergePersons(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function mergeOrgsAction(
  input: MergeArgs,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await mergeOrgs(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}
