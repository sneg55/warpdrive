"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";
import { deleteActivity } from "./activityDelete";
import { updateActivity } from "./activityUpdate";
import { notifyOnActivityCreated } from "./notifyHelpers";
import { completeActivity, createActivity } from "./repo";
import type { ActivityCreateInput, ActivityUpdateInput } from "./schemas";

type ActionResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

export async function createActivityAction(
  input: ActivityCreateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  if (!can(actor, "activity.create")) {
    return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };
  }

  const result = await createActivity(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  await notifyOnActivityCreated(db, { activity: result.value, actorId: actor.id, signal: SIG() });

  return { ok: true, value: { id: result.value.id } };
}

export async function completeActivityAction(
  input: { id: string; done: boolean },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // Record-scoped: completeActivity gates via can(actor, "activity.complete", vis).
  const result = await completeActivity(db, actor, input.id, input.done, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function editActivityAction(
  input: ActivityUpdateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // Record-scoped: updateActivity gates via can(actor, "activity.edit", vis).
  const result = await updateActivity(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function deleteActivityAction(
  input: { id: string },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // Record-scoped: deleteActivity gates via can(actor, "activity.delete", vis).
  const result = await deleteActivity(db, actor, input.id, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}
