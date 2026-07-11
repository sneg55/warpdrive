"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { mergeDeals, mergeDealsInput } from "./mergeDeals";

export type MergeDealsResult =
  | { ok: true; deal: { id: string } }
  | { ok: false; error: { id: string } };

// CSRF-guarded merge action. Validates input at the boundary (E_DEAL_013), then runs the domain
// fn under the standard prologue. Returns the surviving (target) deal id.
export async function mergeDealsAction(
  input: {
    targetDealId: string;
    sourceDealId: string;
    expectedTargetUpdatedAt: string;
    expectedSourceUpdatedAt: string;
  },
  csrfToken: string | null = null,
): Promise<MergeDealsResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const parsed = mergeDealsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.DEAL_MERGE_INPUT_INVALID } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await mergeDeals(db, actor, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, deal: { id: result.value.targetId } };
}
