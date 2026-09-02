import { and, eq, isNull, sql } from "drizzle-orm";
import { activities, activityGuests, activityParticipants, emailThreads } from "@/db/schema";
import { recomputeDealActivityDates } from "@/features/activities/nextActivity";
import type { DbOrTx } from "@/server/realtime/channelVersions";

// Carry a converted lead's history onto the new deal, inside the convert transaction so the deal is
// never created without it. The lead keeps its own copy: it stays readable as an archived record
// rather than being hollowed out by its own conversion.
//
// Each source needs a different mechanism, decided by that table's constraints, not by preference:
//  - notes are polymorphic ((entity_type, entity_id)) and free of constraints, so they are copied.
//  - activities carry check activity_single_parent (deal XOR lead), so the deal gets a NEW row and
//    the lead keeps the original. Note this means an open activity now exists twice, once per
//    parent, and reminders fire for both.
//  - email_threads cannot be copied at all: unique (account_id, gmail_thread_id) allows exactly one
//    row per Gmail conversation per mailbox. There is no single-parent check there, so the one row
//    carries both links and appears on the deal and on the lead.
export async function carryLeadHistoryToDeal(
  tx: DbOrTx,
  args: { leadId: string; dealId: string; signal: AbortSignal },
): Promise<void> {
  args.signal.throwIfAborted();

  // Notes: copy body/pinned/author and the ORIGINAL created_at, so the deal timeline keeps the order
  // the conversation actually happened in rather than bunching every note at the convert moment.
  await tx.execute(sql`
    INSERT INTO notes (entity_type, entity_id, body, pinned, author_id, created_at)
    SELECT 'deal', ${args.dealId}, body, pinned, author_id, created_at
    FROM notes
    WHERE entity_type = 'lead' AND entity_id = ${args.leadId} AND deleted_at IS NULL
  `);
  args.signal.throwIfAborted();

  await copyActivities(tx, args);
  await recomputeDealActivityDates(tx, args.dealId, args.signal);

  // Email: add the deal link, keep the lead link. Only threads not already tied to another deal.
  await tx
    .update(emailThreads)
    .set({ dealId: args.dealId, updatedAt: new Date() })
    .where(and(eq(emailThreads.leadId, args.leadId), isNull(emailThreads.dealId)));
  args.signal.throwIfAborted();
}

// One new activity per lead-scoped activity, re-parented to the deal, with its participants and
// guests. Done row by row rather than as one INSERT ... SELECT because the child rows key off the
// NEW activity id, which only exists once the parent is inserted.
async function copyActivities(
  tx: DbOrTx,
  args: { leadId: string; dealId: string; signal: AbortSignal },
): Promise<void> {
  const source = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.leadId, args.leadId), isNull(activities.deletedAt)));
  args.signal.throwIfAborted();

  for (const act of source) {
    const [copy] = await tx
      .insert(activities)
      .values({
        typeId: act.typeId,
        subject: act.subject,
        dueAt: act.dueAt,
        endAt: act.endAt,
        durationMinutes: act.durationMinutes,
        priority: act.priority,
        done: act.done,
        allDay: act.allDay,
        doneAt: act.doneAt,
        ownerId: act.ownerId,
        assigneeId: act.assigneeId,
        // The whole point: the copy hangs off the deal. leadId stays null (single-parent check).
        dealId: args.dealId,
        personId: act.personId,
        orgId: act.orgId,
        customFields: act.customFields,
        location: act.location,
        note: act.note,
        videoCallUrl: act.videoCallUrl,
        createdAt: act.createdAt,
      })
      .returning({ id: activities.id });
    if (copy === undefined) continue;

    const parts = await tx
      .select()
      .from(activityParticipants)
      .where(eq(activityParticipants.activityId, act.id));
    if (parts.length > 0) {
      await tx
        .insert(activityParticipants)
        .values(parts.map((p) => ({ activityId: copy.id, userId: p.userId, role: p.role })));
    }

    const guests = await tx
      .select()
      .from(activityGuests)
      .where(eq(activityGuests.activityId, act.id));
    if (guests.length > 0) {
      await tx
        .insert(activityGuests)
        .values(guests.map((g) => ({ activityId: copy.id, personId: g.personId })));
    }
    args.signal.throwIfAborted();
  }
}
