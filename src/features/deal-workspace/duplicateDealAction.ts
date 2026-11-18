"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { duplicateDeal, duplicateDealInput } from "./duplicateDeal";

export type DuplicateDealResult =
  | { ok: true; deal: { id: string } }
  | { ok: false; error: { id: string } };

export async function duplicateDealAction(
  input: { dealId: string },
  csrfToken: string | null = null,
): Promise<DuplicateDealResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const parsed = duplicateDealInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.DEAL_DUPLICATE_INPUT_INVALID } };
  }

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await duplicateDeal(db, actor, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, deal: { id: result.value.id } };
}
