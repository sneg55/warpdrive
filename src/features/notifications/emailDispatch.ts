import { EMAIL_NOTIFICATION_QUEUE } from "@/constants/jobNames";
import type { NotificationType } from "@/constants/notificationTypes";
import type { Db } from "@/db/client";
import { requireBoss } from "@/jobs/requireBoss";
import { resolveDelivery } from "./preferences";

// Enqueue an email notification for a recipient if they have opted in to email
// delivery for this notification type. No-ops when pg-boss is not running
// (tests, scripts); in production requireBoss throws rather than dropping the email.
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
