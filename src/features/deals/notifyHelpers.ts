import { NOTIFY_STRINGS } from "@/constants/notifyStrings";
import type { Db } from "@/db/client";
import type { deals } from "@/db/schema";
import { notifyDealFollowedUpdate, notifyDealWonLost } from "@/features/notifications/wire";

type Deal = typeof deals.$inferSelect;

interface NotifyOnDealUpdateArgs {
  deal: Deal;
  input: { status?: "open" | "won" | "lost"; [key: string]: unknown };
  actorId: string;
  signal: AbortSignal;
}

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
