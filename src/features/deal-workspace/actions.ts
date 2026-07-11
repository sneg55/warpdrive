"use server";

import { after } from "next/server";
import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { notifyOnDealUpdate } from "@/features/deals/notifyHelpers";
import type { ChangeOwnerInput, ChangeStageInput, DeleteDealInput } from "@/features/deals/schemas";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { changeOwner } from "./changeOwner";
import { changeStage } from "./changeStage";
import { markLostInput } from "./dealCloseSchemas";
import { deleteDeal } from "./deleteDeal";
import { followDeal, unfollowDeal } from "./followers";
import { addParticipant, removeParticipant } from "./participants";
import { markLost, markWon, reopenDeal } from "./wonLost";

type IdResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

type VoidResult = { ok: true } | { ok: false; error: { id: string } };

type DealResult =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };

export async function markWonAction(
  input: { dealId: string },
  csrfToken: string | null = null,
): Promise<IdResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // Record-scoped: loadEditableDeal inside markWon gates edit permission.
  const result = await markWon(db, actor, input.dealId, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  // Fan out deal_won to followers UNION owner minus actor (spec-0 notify gap fix). Runs outside
  // the markWon transaction on the db singleton, so it is deferred past the response rather than
  // billed to the user's click. It must never throw in after().
  const won = result.value;
  after(async () => {
    try {
      await notifyOnDealUpdate(db, {
        deal: won,
        input: { status: "won" },
        actorId: actor.id,
        signal: SIG(),
      });
    } catch (err: unknown) {
      console.warn("markWonAction: notifyOnDealUpdate failed (deferred)", { err });
    }
  });

  return { ok: true, value: { id: result.value.id } };
}

export async function reopenDealAction(
  input: { dealId: string },
  csrfToken: string | null = null,
): Promise<IdResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // Record-scoped: loadEditableDeal inside reopenDeal gates edit permission.
  const result = await reopenDeal(db, actor, input.dealId, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  // Notify followers of the status change, like markWon/markLost and the generic update path.
  // status "open" routes to the followed-update fan-out (not won/lost). Deferred past the
  // response: outside the reopenDeal transaction, invisible to the caller.
  const reopened = result.value;
  after(async () => {
    try {
      await notifyOnDealUpdate(db, {
        deal: reopened,
        input: { status: "open" },
        actorId: actor.id,
        signal: SIG(),
      });
    } catch (err: unknown) {
      console.warn("reopenDealAction: notifyOnDealUpdate failed (deferred)", { err });
    }
  });

  return { ok: true, value: { id: result.value.id } };
}

export async function markLostAction(
  input: { dealId: string; lostReasonId?: string | null; lostReason?: string | null },
  csrfToken: string | null = null,
): Promise<IdResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const parsed = markLostInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.DEAL_LOST_INPUT_INVALID } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await markLost(
    db,
    actor,
    parsed.data.dealId,
    { lostReasonId: parsed.data.lostReasonId, lostReason: parsed.data.lostReason },
    SIG(),
  );
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  // Fan out deal_lost to followers UNION owner minus actor (spec-0 notify gap fix).
  await notifyOnDealUpdate(db, {
    deal: result.value,
    input: { status: "lost" },
    actorId: actor.id,
    signal: SIG(),
  });

  return { ok: true, value: { id: result.value.id } };
}

export async function changeStageAction(
  input: ChangeStageInput,
  csrfToken: string | null = null,
): Promise<DealResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await changeStage(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return {
    ok: true,
    deal: { id: result.value.id, updatedAt: result.value.updatedAt.toISOString() },
  };
}

export async function changeOwnerAction(
  input: ChangeOwnerInput,
  csrfToken: string | null = null,
): Promise<DealResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await changeOwner(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return {
    ok: true,
    deal: { id: result.value.id, updatedAt: result.value.updatedAt.toISOString() },
  };
}

export async function deleteDealAction(
  input: DeleteDealInput,
  csrfToken: string | null = null,
): Promise<DealResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await deleteDeal(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return {
    ok: true,
    deal: { id: result.value.id, updatedAt: result.value.updatedAt.toISOString() },
  };
}

export async function followDealAction(
  input: { dealId: string },
  csrfToken: string | null = null,
): Promise<VoidResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await followDeal(db, actor, input.dealId, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}

export async function unfollowDealAction(
  input: { dealId: string },
  csrfToken: string | null = null,
): Promise<VoidResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await unfollowDeal(db, actor, input.dealId, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}

export async function addParticipantAction(
  input: { dealId: string; personId: string; role: string | null },
  csrfToken: string | null = null,
): Promise<VoidResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await addParticipant(db, actor, input.dealId, input.personId, input.role, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}

export async function removeParticipantAction(
  input: { dealId: string; personId: string },
  csrfToken: string | null = null,
): Promise<VoidResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await removeParticipant(db, actor, input.dealId, input.personId, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}
