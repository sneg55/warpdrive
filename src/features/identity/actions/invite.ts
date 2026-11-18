"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { inviteUserInput } from "@/features/identity/schemas";
import { createContext } from "@/server/trpc/context";
import { inviteUser } from "../invite.service";
import { guardCsrf } from "./shared";
import { SIG } from "./sig";

type InviteActionResult = { ok: true; userId: string } | { ok: false; error: { id: string } };

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
