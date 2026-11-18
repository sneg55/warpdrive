import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notifications } from "@/db/schema";
import { hydrateOwner } from "@/features/email/syncCursor";
import { canActorAccessParent } from "@/features/files/fileAuthz";

export async function scrubInaccessible(
  db: Db,
  args: {
    entityType: "deal" | "person" | "organization";
    entityId: string;
    signal: AbortSignal;
  },
): Promise<number> {
  args.signal.throwIfAborted();

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

    const hydrateResult = await hydrateOwner(db, userId, args.signal);
    args.signal.throwIfAborted();

    if (!hydrateResult.ok) {
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
