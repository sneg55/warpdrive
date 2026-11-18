import { EMAIL_NOTIFICATION_QUEUE } from "@/constants/jobNames";
import type { NotificationType } from "@/constants/notificationTypes";
import type { Db } from "@/db/client";
import { requireBoss } from "@/jobs/requireBoss";
import { resolveDelivery } from "./preferences";

export async function enqueueEmailNotification(
  db: Db,
  notificationId: string,
  recipientId: string,
  type: NotificationType,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();

  const delivery = await resolveDelivery(db, recipientId, type, signal);
  if (delivery.email !== true) return;

  const boss = requireBoss();
  if (boss === null) return;

  await boss.send(EMAIL_NOTIFICATION_QUEUE, { notificationId }, { singletonKey: notificationId });
}
