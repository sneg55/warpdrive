"use server";

import { after } from "next/server";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { moveDeal } from "./dealActions";
import { notifyOnDealMove } from "./notifyHelpers";
import type { DealMoveInput } from "./schemas";

export type MoveResult =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };

// CSRF-guarded deal move action.
// guardCsrf is called FIRST: no DB work happens before CSRF is verified.
// The actor is loaded from the live session; client identity is never trusted.
export async function moveDealAction(
  input: DealMoveInput,
  csrfToken: string | null = null,
): Promise<MoveResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: "E_AUTH_003" } };

  const result = await moveDeal(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  // Deferred past the response: the fan-out is outside the deal transaction and invisible to the
  // caller. Never let it throw in after(); the user cannot act on a failure there.
  const moved = result.value;
  after(async () => {
    try {
      await notifyOnDealMove(db, { deal: moved, actorId: actor.id, signal: SIG() });
    } catch (err: unknown) {
      console.warn("moveDealAction: notifyOnDealMove failed (deferred)", { err });
    }
  });

  return {
    ok: true,
    deal: { id: result.value.id, updatedAt: result.value.updatedAt.toISOString() },
  };
}
