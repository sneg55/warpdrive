import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { wsChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { notifications } from "@/db/schema";
import { hydrateOwner } from "@/features/email/syncCursor";
import { canActorAccessParent } from "@/features/files/fileAuthz";
import { publishEvent } from "@/server/notify";
import type { CreateNotificationInput } from "@/types/notification";
import { err, ok, type Result } from "@/types/result";

type ProduceOk = { notificationId: string } | { suppressed: true };

export async function createNotification(
  db: Db,
  input: CreateNotificationInput,
  signal: AbortSignal,
): Promise<Result<ProduceOk, AppError>> {
  signal.throwIfAborted();

  // Hydrate the recipient to check isActive and build AuthUser for visibility.
  const hydrateResult = await hydrateOwner(db, input.recipientId, signal);
  if (hydrateResult.ok !== true) return hydrateResult;
  const recipientUser = hydrateResult.value;

  // Inactive recipients are suppressed: no insert, no publish.
  if (recipientUser.isActive !== true) {
    return ok({ suppressed: true });
  }

  // Visibility gate: any non-null entityType names a gated record and ALWAYS
  // requires a check. A gated type with a null id can never pass a visibility
  // check, so it is suppressed rather than inserted unchecked (leak surface).
  // Both-null (a system notification with no gating entity) skips the gate.
  if (input.entityType !== null) {
    if (input.entityId === null) return ok({ suppressed: true });
    const canAccess = await canActorAccessParent(
      db,
      recipientUser,
      input.entityType,
      input.entityId,
      signal,
    );
    signal.throwIfAborted();
    // Leak-prevention core: never insert or publish when the recipient cannot see the entity.
    if (canAccess !== true) {
      return ok({ suppressed: true });
    }
  }

  // Insert and publish in a single transaction so a rollback emits nothing.
  const notificationId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(notifications)
      .values({
        userId: input.recipientId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        actorId: input.actorId,
        payload: input.payload,
      })
      .returning({ id: notifications.id });

    if (row === undefined) {
      throw new AppError(
        ERROR_IDS.DB_INSERT_FAILED,
        "createNotification: insert returned no rows",
        {
          recipientId: input.recipientId,
        },
      );
    }

    await publishEvent(
      tx,
      {
        v: 1,
        channel: wsChannel.user(input.recipientId),
        ts: new Date().toISOString(),
        actorId: input.actorId,
        type: "notification",
        data: { notificationId: row.id, kind: input.type },
      },
      signal,
    );

    return row.id;
  });

  return ok({ notificationId });
}

// Fan-out: map each input through createNotification. A single failure becomes
// an err entry and does NOT abort the batch. AbortError is always rethrown.
export async function fanOut(
  db: Db,
  inputs: CreateNotificationInput[],
  signal: AbortSignal,
): Promise<Result<ProduceOk, AppError>[]> {
  const results: Result<ProduceOk, AppError>[] = [];

  for (const input of inputs) {
    signal.throwIfAborted();
    try {
      results.push(await createNotification(db, input, signal));
    } catch (e) {
      // AbortError must never be swallowed.
      if (e instanceof Error && e.name === "AbortError") throw e;
      const msg = e instanceof Error ? e.message : String(e);
      results.push(
        err(
          new AppError(ERROR_IDS.NOTIF_PRODUCE_FAILED, `notification produce failed: ${msg}`, {
            recipientId: input.recipientId,
          }),
        ),
      );
    }
  }

  return results;
}
