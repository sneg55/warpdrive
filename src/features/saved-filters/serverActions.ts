"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { createContext } from "@/server/trpc/context";
import {
  removeSavedFilter,
  saveFilter,
  toggleFavorite,
  updateSavedFilter,
} from "./savedFilterActions";
import type { SaveFilterInput, UpdateSavedFilterInput } from "./schemas";

export type FilterActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: { id: string } };

// Resolve the actor as a FilterSession: userId + isAdmin + a boolean flag map built from the
// actor's permission flag set. owner/flags are derived server-side, never from the client.
async function actorSession(
  csrfToken: string | null,
): Promise<
  | { ok: true; session: { userId: string; isAdmin: boolean; flags: Record<string, boolean> } }
  | { ok: false; error: { id: string } }
> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  const flags: Record<string, boolean> = {};
  for (const f of actor.flags) flags[f] = true;
  return {
    ok: true,
    session: { userId: actor.id, isAdmin: actor.type === "admin", flags },
  };
}

export async function createSavedFilterAction(
  input: SaveFilterInput,
  csrfToken: string | null = null,
): Promise<FilterActionResult<{ id: string }>> {
  const a = await actorSession(csrfToken);
  if (!a.ok) return a;
  const r = await saveFilter(db, a.session, input, AbortSignal.timeout(10_000));
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: { id: r.value.id } };
}

export async function updateSavedFilterAction(
  id: string,
  input: UpdateSavedFilterInput,
  csrfToken: string | null = null,
): Promise<FilterActionResult> {
  const a = await actorSession(csrfToken);
  if (!a.ok) return a;
  const r = await updateSavedFilter(db, a.session, id, input, AbortSignal.timeout(10_000));
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: undefined };
}

export async function removeSavedFilterAction(
  id: string,
  csrfToken: string | null = null,
): Promise<FilterActionResult> {
  const a = await actorSession(csrfToken);
  if (!a.ok) return a;
  const r = await removeSavedFilter(db, a.session, id, AbortSignal.timeout(10_000));
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: undefined };
}

export async function toggleFavoriteAction(
  id: string,
  csrfToken: string | null = null,
): Promise<FilterActionResult> {
  const a = await actorSession(csrfToken);
  if (!a.ok) return a;
  const r = await toggleFavorite(db, a.session, id, AbortSignal.timeout(10_000));
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: undefined };
}
