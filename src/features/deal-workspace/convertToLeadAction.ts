"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { convertDealToLead, convertDealToLeadInput } from "./convertToLead";

export type ConvertToLeadResult =
  | { ok: true; lead: { id: string } }
  | { ok: false; error: { id: string } };

// CSRF-guarded convert-to-lead action. Validates input at the boundary (E_DEAL_012), then runs the
// domain fn under the standard prologue. Returns the new lead id so the client can route to it.
export async function convertToLeadAction(
  input: { dealId: string; expectedUpdatedAt: string },
  csrfToken: string | null = null,
): Promise<ConvertToLeadResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const parsed = convertDealToLeadInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.DEAL_CONVERT_INPUT_INVALID } };
  }

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await convertDealToLead(db, actor, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, lead: { id: result.value.leadId } };
}
