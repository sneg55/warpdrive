// notifyHelpers.ts: best-effort notification dispatch called from activity actions
// after a successful domain write. Errors are swallowed with console.warn so
// a notification failure never aborts the underlying action.
import type { Db } from "@/db/client";
import type { Activity } from "@/db/schema/activities";
import { notifyActivityAssigned } from "@/features/notifications/wire";

interface NotifyOnActivityCreatedArgs {
  activity: Activity;
  actorId: string;
  signal: AbortSignal;
}

// The activity's DOMINANT parent (deal > person > org), as an entity ref the notification
// producer can visibility-check. A parentless activity yields a null ref: no gate is needed
// because its only viewers are the assignee/participants (F26).
export function activityParentRef(activity: Activity): {
  entityType: string | null;
  entityId: string | null;
} {
  if (activity.dealId !== null) return { entityType: "deal", entityId: activity.dealId };
  if (activity.personId !== null) return { entityType: "person", entityId: activity.personId };
  if (activity.orgId !== null) return { entityType: "organization", entityId: activity.orgId };
  return { entityType: null, entityId: null };
}

// Call after createActivity returns ok. Fires activity_assigned to the assignee
// when the assignee differs from the actor. Self-assignments are dropped by the
// adapter internally. Best-effort: never throws.
export async function notifyOnActivityCreated(
  db: Db,
  args: NotifyOnActivityCreatedArgs,
): Promise<void> {
  const { activity, actorId, signal } = args;
  try {
    const parent = activityParentRef(activity);
    await notifyActivityAssigned(db, {
      activityId: activity.id,
      assigneeId: activity.assigneeId,
      actorId,
      entityType: parent.entityType,
      entityId: parent.entityId,
      subject: activity.subject,
      signal,
    });
  } catch (err) {
    console.warn("notifyOnActivityCreated: notification failed (best-effort)", { err });
  }
}
