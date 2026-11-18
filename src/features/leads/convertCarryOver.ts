import { and, eq, isNull, sql } from "drizzle-orm";
import { activities, activityGuests, activityParticipants, emailThreads } from "@/db/schema";
import { recomputeDealActivityDates } from "@/features/activities/nextActivity";
import type { DbOrTx } from "@/server/realtime/channelVersions";

export async function carryLeadHistoryToDeal(
  tx: DbOrTx,
  args: { leadId: string; dealId: string; signal: AbortSignal },
): Promise<void> {
  args.signal.throwIfAborted();

  await tx.execute(sql`
    INSERT INTO notes (entity_type, entity_id, body, pinned, author_id, created_at)
    SELECT 'deal', ${args.dealId}, body, pinned, author_id, created_at
    FROM notes
    WHERE entity_type = 'lead' AND entity_id = ${args.leadId} AND deleted_at IS NULL
  `);
  args.signal.throwIfAborted();

  await copyActivities(tx, args);
  await recomputeDealActivityDates(tx, args.dealId, args.signal);

  await tx
    .update(emailThreads)
    .set({ dealId: args.dealId, updatedAt: new Date() })
    .where(and(eq(emailThreads.leadId, args.leadId), isNull(emailThreads.dealId)));
  args.signal.throwIfAborted();
}

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
