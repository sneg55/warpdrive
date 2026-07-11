"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { updateUserProfile } from "./profile.service";

type ActionResult = { ok: true } | { ok: false; error: { id: string } };

async function actorId(
  csrfToken: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: { id: string } }> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  return { ok: true, id: actor.id };
}

// Editable display name (Wave 1 scope). Avatar upload is deferred to a later wave.
export async function updateUserProfileAction(
  input: { name: string },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const r = await updateUserProfile(db, { actorId: a.id, name: input.name }, SIG());
  return r.ok ? { ok: true } : { ok: false, error: { id: r.error.id } };
}
