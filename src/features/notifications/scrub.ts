import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notifications } from "@/db/schema";
import { hydrateOwner } from "@/features/email/syncCursor";
import { canActorAccessParent } from "@/features/files/fileAuthz";

// Delete notifications for users who can no longer see the given entity.
// Called after any ACL-changing mutation: owner change, visibility level/group
// change, visible_to_user_ids change, pipeline restriction.
//
// Approach: per-recipient hydrate + dispatch. We fetch distinct recipients,
// hydrate each as an AuthUser, and run the same canActorAccessParent check
// the production visibility layer uses. This avoids reimplementing the deal/
// person/org visibility predicate in SQL and ensures parity with query-time checks.
//
// Hydrate-error handling: if hydrateOwner fails for a recipient (e.g. the
// user row was deleted between the SELECT and the hydrate), we SKIP that
// recipient rather than deleting their notifications. A transient DB error
// must not cause spurious data loss. The trade-off: a deleted user's stale
// notifications are left in place until a separate cleanup pass. This is
// documented as a known limitation.
//
// Returns the total number of notification rows deleted.
export async function scrubInaccessible(
  db: Db,
  args: {
    entityType: "deal" | "person" | "organization";
    entityId: string;
    signal: AbortSignal;
  },
): Promise<number> {
  args.signal.throwIfAborted();

  // Find all distinct recipients who have a notification for this entity.
  const recipientRows = await db
    .selectDistinct({ userId: notifications.userId })
    .from(notifications)
    .where(
      and(eq(notifications.entityType, args.entityType), eq(notifications.entityId, args.entityId)),
    );
  args.signal.throwIfAborted();

  let totalDeleted = 0;

  for (const { userId } of recipientRows) {
    args.signal.throwIfAborted();

    // Hydrate the recipient as an AuthUser for the visibility check.
    const hydrateResult = await hydrateOwner(db, userId, args.signal);
    args.signal.throwIfAborted();

    if (!hydrateResult.ok) {
      // Transient or missing-user error: skip to avoid spurious deletion.
      continue;
    }

    const recipientUser = hydrateResult.value;

    const canSee = await canActorAccessParent(
      db,
      recipientUser,
      args.entityType,
      args.entityId,
      args.signal,
    );
    args.signal.throwIfAborted();

    if (canSee !== true) {
      // Recipient lost access: delete all their notifications for this entity.
      const result = await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.entityType, args.entityType),
            sql`${notifications.entityId} = ${args.entityId}::uuid`,
          ),
        );
      totalDeleted += result.rowCount ?? 0;
      args.signal.throwIfAborted();
    }
  }

  return totalDeleted;
}
