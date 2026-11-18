"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { captureServerError } from "@/features/observability/server";
import { can } from "@/features/permissions/can";
import { guardWrite } from "@/server/guardWrite";
import { createContext } from "@/server/trpc/context";
import { deleteActivity } from "./activityDelete";
import { updateActivity } from "./activityUpdate";
import { notifyOnActivityCreated } from "./notifyHelpers";
import { scheduleReminder } from "./reminders";
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

  const result = await guardWrite("createActivityAction", actor.id, () =>
    createActivity(db, actor, input, SIG(), { scheduleReminder: false }),
  );
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  try {
    await scheduleReminder(result.value.id, result.value.dueAt, SIG());
  } catch (e) {
    console.error("createActivityAction: reminder scheduling failed", e);
    captureServerError(actor.id, e, { action: "createActivityAction.scheduleReminder" });
  }

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

  const result = await guardWrite("editActivityAction", actor.id, () =>
    updateActivity(db, actor, input, SIG()),
  );
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

  const result = await deleteActivity(db, actor, input.id, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}
