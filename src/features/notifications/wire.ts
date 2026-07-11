import { and, eq, ne } from "drizzle-orm";
import type { NotificationType } from "@/constants/notificationTypes";
import type { Db } from "@/db/client";
import { dealFollowers, deals } from "@/db/schema";
import type { CreateNotificationInput } from "@/types/notification";
import { enqueueEmailNotification } from "./emailDispatch";
import { createNotification, fanOut } from "./produce";

// deliver: call the producer and, if a notification row was created, enqueue
// the email-dispatch job. Suppressed outcomes (visibility or preferences) are
// a no-op. Errors are logged via console.warn and swallowed so a single
// recipient failure never aborts a fan-out.
async function deliver(db: Db, input: CreateNotificationInput, signal: AbortSignal): Promise<void> {
  const r = await createNotification(db, input, signal);
  if (!r.ok) {
    console.warn("notification produce failed", {
      error: r.error.id,
      recipientId: input.recipientId,
    });
    return;
  }
  if ("suppressed" in r.value) return;
  await enqueueEmailNotification(db, r.value.notificationId, input.recipientId, input.type, signal);
}

// Load follower ids for a deal, optionally excluding one user (the actor).
async function followerIds(
  db: Db,
  dealId: string,
  excludeId: string | null,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const rows =
    excludeId !== null
      ? await db
          .select({ userId: dealFollowers.userId })
          .from(dealFollowers)
          .where(and(eq(dealFollowers.dealId, dealId), ne(dealFollowers.userId, excludeId)))
      : await db
          .select({ userId: dealFollowers.userId })
          .from(dealFollowers)
          .where(eq(dealFollowers.dealId, dealId));
  signal.throwIfAborted();
  return rows.map((r) => r.userId);
}

// notifyActivityAssigned: notify the assignee that they have been assigned an
// activity. Self-assignments (assigneeId === actorId) are silently dropped.
// The visibility gate is the activity's DOMINANT PARENT (deal > person > org),
// passed as entityType/entityId so the producer suppresses a notification whose
// parent the assignee cannot see (F26). A parentless activity (all null) needs no
// gate: its only viewers are the assignee/participants, and the recipient IS the
// assignee.
export async function notifyActivityAssigned(
  db: Db,
  args: {
    activityId: string;
    assigneeId: string;
    actorId: string;
    entityType: string | null;
    entityId: string | null;
    subject: string;
    signal: AbortSignal;
  },
): Promise<void> {
  if (args.assigneeId === args.actorId) return;
  await deliver(
    db,
    {
      recipientId: args.assigneeId,
      type: "activity_assigned" satisfies NotificationType,
      entityType: args.entityType,
      entityId: args.entityId,
      actorId: args.actorId,
      payload: { activityId: args.activityId, subject: args.subject },
    },
    args.signal,
  );
}

// notifyActivityReminder: system-generated reminder, no actor.
// Same dominant-parent visibility gating as notifyActivityAssigned (F26).
export async function notifyActivityReminder(
  db: Db,
  args: {
    activityId: string;
    assigneeId: string;
    entityType: string | null;
    entityId: string | null;
    subject: string;
    signal: AbortSignal;
  },
): Promise<void> {
  await deliver(
    db,
    {
      recipientId: args.assigneeId,
      type: "activity_reminder" satisfies NotificationType,
      entityType: args.entityType,
      entityId: args.entityId,
      actorId: null,
      payload: { activityId: args.activityId, subject: args.subject },
    },
    args.signal,
  );
}

// notifyDealFollowedUpdate: fan out to all followers of the deal except the actor.
// Email enqueue happens per non-suppressed result via enqueueEmailNotification.
export async function notifyDealFollowedUpdate(
  db: Db,
  args: {
    dealId: string;
    actorId: string;
    changeSummary: string;
    signal: AbortSignal;
  },
): Promise<void> {
  const ids = await followerIds(db, args.dealId, args.actorId, args.signal);
  if (ids.length === 0) return;

  const results = await fanOut(
    db,
    ids.map((id) => ({
      recipientId: id,
      type: "deal_followed_update" satisfies NotificationType,
      entityType: "deal",
      entityId: args.dealId,
      actorId: args.actorId,
      payload: { changeSummary: args.changeSummary },
    })),
    args.signal,
  );

  for (let i = 0; i < ids.length; i++) {
    const r = results[i];
    const recipientId = ids[i];
    if (r === undefined || recipientId === undefined) continue;
    if (!r.ok || "suppressed" in r.value) continue;
    await enqueueEmailNotification(
      db,
      r.value.notificationId,
      recipientId,
      "deal_followed_update",
      args.signal,
    );
  }
}

// notifyDealWonLost: notify followers UNION the deal owner, excluding the actor.
// Deduplicates so the owner-as-follower case sends exactly one notification.
export async function notifyDealWonLost(
  db: Db,
  args: {
    dealId: string;
    status: "won" | "lost";
    actorId: string;
    signal: AbortSignal;
  },
): Promise<void> {
  args.signal.throwIfAborted();

  // Load owner id.
  const [dealRow] = await db
    .select({ ownerId: deals.ownerId })
    .from(deals)
    .where(eq(deals.id, args.dealId));
  args.signal.throwIfAborted();

  if (dealRow === undefined) return;

  // Followers excluding actor.
  const fIds = await followerIds(db, args.dealId, args.actorId, args.signal);

  // Union: followers + owner, deduplicated, excluding actor.
  const seen = new Set<string>(fIds);
  const allIds: string[] = [...fIds];
  if (dealRow.ownerId !== args.actorId && !seen.has(dealRow.ownerId)) {
    allIds.push(dealRow.ownerId);
  }

  if (allIds.length === 0) return;

  const type = (args.status === "won" ? "deal_won" : "deal_lost") satisfies NotificationType;

  const results = await fanOut(
    db,
    allIds.map((id) => ({
      recipientId: id,
      type,
      entityType: "deal",
      entityId: args.dealId,
      actorId: args.actorId,
      payload: { status: args.status },
    })),
    args.signal,
  );

  for (let i = 0; i < allIds.length; i++) {
    const r = results[i];
    const recipientId = allIds[i];
    if (r === undefined || recipientId === undefined) continue;
    if (!r.ok || "suppressed" in r.value) continue;
    await enqueueEmailNotification(db, r.value.notificationId, recipientId, type, args.signal);
  }
}

// notifyEmailEvent: notify the mailbox owner of an email open or click event.
// The producer routes email_message entityType through canSeeEmailParent
// (no admin bypass) automatically.
export async function notifyEmailEvent(
  db: Db,
  args: {
    kind: "email_open" | "email_click";
    mailboxOwnerId: string;
    threadId: string;
    messageId: string;
    eventId: string;
    signal: AbortSignal;
  },
): Promise<void> {
  await deliver(
    db,
    {
      recipientId: args.mailboxOwnerId,
      type: args.kind satisfies NotificationType,
      entityType: "email_message",
      entityId: args.messageId,
      actorId: null,
      payload: { threadId: args.threadId, eventId: args.eventId },
    },
    args.signal,
  );
}
