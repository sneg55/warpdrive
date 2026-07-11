"use server";

import { after } from "next/server";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { scrubInaccessible } from "@/features/notifications/scrub";
import { createContext } from "@/server/trpc/context";
import { updateDeal } from "./dealActions";
import { notifyOnDealUpdate } from "./notifyHelpers";
import type { DealUpdateInput } from "./schemas";

export type UpdateResult =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };

// CSRF-guarded deal update action.
// guardCsrf is called FIRST: no DB work happens before CSRF is verified.
// The actor is loaded from the live session; client identity is never trusted.
export async function updateDealAction(
  input: DealUpdateInput,
  csrfToken: string | null = null,
): Promise<UpdateResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: "E_AUTH_003" } };

  const result = await updateDeal(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  // The fan-out runs outside the deal transaction on the db singleton and the user never sees it,
  // so it must not sit on the response. after() runs it once the response has been sent. It must
  // never throw there: an unhandled rejection in after() is a server error the user cannot act on.
  const deal = result.value;
  after(async () => {
    try {
      await notifyOnDealUpdate(db, {
        deal,
        input: { status: input.status },
        actorId: actor.id,
        signal: SIG(),
      });
    } catch (err: unknown) {
      console.warn("updateDealAction: notifyOnDealUpdate failed (deferred)", { err });
    }
  });

  // Best-effort: scrub stale notifications when a visibility-narrowing field changed.
  // visibilityGroupId is the only such field accepted by dealUpdateInput today.
  // Runs OUTSIDE the transaction (db singleton), never fails the action.
  if (input.visibilityGroupId !== undefined) {
    scrubInaccessible(db, {
      entityType: "deal",
      entityId: result.value.id,
      signal: SIG(),
    }).catch((err: unknown) => {
      console.warn("updateDealAction: scrubInaccessible failed (best-effort)", { err });
    });
  }

  return {
    ok: true,
    deal: { id: result.value.id, updatedAt: result.value.updatedAt.toISOString() },
  };
}
