"use server";

import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { markAllRead, markRead } from "./feed";
import { setPreference } from "./preferences";
import { markReadInput, setPreferenceInput } from "./schemas";

type ActionResult<T = Record<string, never>> =
  | { ok: true; value: T }
  | { ok: false; error: { id: string } };

export async function markReadAction(
  input: { id: string },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor, db } = await createContext();
  if (actor === null) return { ok: false, error: { id: "E_AUTH_003" } };

  const parsed = markReadInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: "E_NOTIF_001" } };
  }

  await markRead(db, actor, parsed.data.id, SIG());
  return { ok: true, value: {} };
}

export async function markAllReadAction(csrfToken: string | null = null): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor, db } = await createContext();
  if (actor === null) return { ok: false, error: { id: "E_AUTH_003" } };

  await markAllRead(db, actor, SIG());
  return { ok: true, value: {} };
}

export async function setPreferenceAction(
  input: { type: string; inApp: boolean; email: boolean },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor, db } = await createContext();
  if (actor === null) return { ok: false, error: { id: "E_AUTH_003" } };

  const parsed = setPreferenceInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: "E_NOTIF_001" } };
  }

  await setPreference(
    db,
    actor.id,
    parsed.data.type,
    { inApp: parsed.data.inApp, email: parsed.data.email },
    SIG(),
  );
  return { ok: true, value: {} };
}
