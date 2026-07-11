// notifyHelpers.ts: best-effort notification dispatch called from deal actions
// after a successful domain write. Errors are swallowed with console.warn so
// a notification failure never aborts the underlying action.
import { NOTIFY_STRINGS } from "@/constants/notifyStrings";
import type { Db } from "@/db/client";
import type { deals } from "@/db/schema";
import { notifyDealFollowedUpdate, notifyDealWonLost } from "@/features/notifications/wire";

type Deal = typeof deals.$inferSelect;

// Input shape mirrors what the action knows after updateDeal returns ok.
// status is the only field that routes between won/lost vs followed-update.
interface NotifyOnDealUpdateArgs {
  deal: Deal;
  // Only the status field matters for routing; other update fields are ignored.
  input: { status?: "open" | "won" | "lost"; [key: string]: unknown };
  actorId: string;
  signal: AbortSignal;
}

// Call after updateDeal returns ok. If status is won or lost, fires deal_won/lost
// to followers+owner. Otherwise fires deal_followed_update to followers.
// Best-effort: never throws.
export async function notifyOnDealUpdate(db: Db, args: NotifyOnDealUpdateArgs): Promise<void> {
  const { deal, input, actorId, signal } = args;
  try {
    if (input.status === "won" || input.status === "lost") {
      await notifyDealWonLost(db, {
        dealId: deal.id,
        status: input.status,
        actorId,
        signal,
      });
    } else {
      await notifyDealFollowedUpdate(db, {
        dealId: deal.id,
        actorId,
        changeSummary: NOTIFY_STRINGS.dealUpdated,
        signal,
      });
    }
  } catch (err) {
    console.warn("notifyOnDealUpdate: notification failed (best-effort)", { err });
  }
}

interface NotifyOnDealMoveArgs {
  deal: Deal;
  actorId: string;
  signal: AbortSignal;
}

// Call after moveDeal returns ok. Fires deal_followed_update to all followers
// except the actor. Best-effort: never throws.
export async function notifyOnDealMove(db: Db, args: NotifyOnDealMoveArgs): Promise<void> {
  const { deal, actorId, signal } = args;
  try {
    await notifyDealFollowedUpdate(db, {
      dealId: deal.id,
      actorId,
      changeSummary: NOTIFY_STRINGS.dealMoved,
      signal,
    });
  } catch (err) {
    console.warn("notifyOnDealMove: notification failed (best-effort)", { err });
  }
}
