"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { followContact, unfollowContact } from "./followers";
import { type ContactFollowInput, contactFollowInput } from "./schemas";

type ActionResult = { ok: true } | { ok: false; error: { id: string } };

export async function followContactAction(
  input: ContactFollowInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = contactFollowInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.CONTACT_FOLLOW_INPUT_INVALID } };
  }

  const result = await followContact(
    db,
    actor,
    parsed.data.entityType,
    parsed.data.entityId,
    SIG(),
  );
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}

export async function unfollowContactAction(
  input: ContactFollowInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = contactFollowInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.CONTACT_FOLLOW_INPUT_INVALID } };
  }

  const result = await unfollowContact(
    db,
    actor,
    parsed.data.entityType,
    parsed.data.entityId,
    SIG(),
  );
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}
