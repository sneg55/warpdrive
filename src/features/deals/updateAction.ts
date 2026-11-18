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
