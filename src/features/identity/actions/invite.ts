"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { inviteUserInput } from "@/features/identity/schemas";
import { createContext } from "@/server/trpc/context";
import { inviteUser } from "../invite.service";
import { guardCsrf } from "./shared";
import { SIG } from "./sig";

// A plain, JSON/structured-clone-serializable result. An AppError instance's custom `id`
// field does NOT survive React Flight server-action serialization (Error subclasses are
// serialized as bare Errors, dropping `id`), so the client would read `undefined` and collapse
// every error branch to a generic message (IDENTITY-02). Mirrors profileActions' ActionResult.
type InviteActionResult = { ok: true; userId: string } | { ok: false; error: { id: string } };

// Pre-authorizes an email for Google SSO (Task 11): guardCsrf FIRST (write-path CSRF
// enforcement point, ops A0), then validate input at the boundary, then delegate to the
// permission-gated service. Every branch returns the plain shape above so the specific error id
// reaches the client intact.
export async function inviteUserAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<InviteActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };

  const parsed = inviteUserInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.AUTH_INVITE_INPUT_INVALID } };
  }

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_LOGIN_REJECTED } };

  const r = await inviteUser(db, actor, parsed.data, SIG());
  return r.ok ? { ok: true, userId: r.value.userId } : { ok: false, error: { id: r.error.id } };
}
