import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { AppError } from "@/constants/errorIds";
import { EMAIL_NOTIFICATION_QUEUE } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { emailAccounts, notifications, users } from "@/db/schema";
import type { SystemMessage } from "@/features/email/sendSystem";
import { sendGmail } from "@/features/email/sendSystem";
import { canActorAccessParent } from "@/features/files/fileAuthz";
import { hydrateActor } from "@/server/hydrateActor";
import type { EmailAccountRow } from "@/types/email";
import type { NotificationRow } from "@/types/notification";
import { ok, type Result } from "@/types/result";
import { resolveDelivery } from "../preferences";
import { renderNotificationEmail } from "./render";

export type SendFn = (
  account: EmailAccountRow,
  message: SystemMessage,
  signal: AbortSignal,
) => Promise<Result<{ gmailMessageId: string }, AppError>>;

export async function runEmailNotificationJob(
  db: Db,
  data: { notificationId: string },
  signal: AbortSignal,
  deps: { send?: SendFn } = {},
): Promise<Result<{ sent: boolean }, AppError>> {
  signal.throwIfAborted();

  const [row] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, data.notificationId))
    .limit(1);
  signal.throwIfAborted();
  if (row === undefined) return ok({ sent: false });

  if (row.emailSentAt !== null) return ok({ sent: false });

  const notifRow: NotificationRow = {
    id: row.id,
    userId: row.userId,
    type: row.type,
    entityType: row.entityType,
    entityId: row.entityId,
    actorId: row.actorId,
    payload: row.payload,
    readAt: row.readAt !== null ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };

  const recipientUser = await hydrateActor(db, notifRow.userId, signal);
  if (recipientUser === null) return ok({ sent: false });

  if (notifRow.entityType !== null && notifRow.entityId !== null) {
    const canSee = await canActorAccessParent(
      db,
      recipientUser,
      notifRow.entityType,
      notifRow.entityId,
      signal,
    );
    signal.throwIfAborted();
    if (canSee !== true) return ok({ sent: false });
  }

  const delivery = await resolveDelivery(db, notifRow.userId, notifRow.type, signal);
  signal.throwIfAborted();
  if (delivery.email !== true) return ok({ sent: false });

  const [account] = await db
    .select({
      id: emailAccounts.id,
      userId: emailAccounts.userId,
      emailAddress: emailAccounts.emailAddress,
    })
    .from(emailAccounts)
    .where(eq(emailAccounts.userId, notifRow.userId))
    .limit(1);
  signal.throwIfAborted();
  if (account === undefined) return ok({ sent: false });

  const [statusRow] = await db
    .select({ status: emailAccounts.status })
    .from(emailAccounts)
    .where(eq(emailAccounts.id, account.id))
    .limit(1);
  signal.throwIfAborted();
  if (statusRow === undefined || statusRow.status !== "connected") return ok({ sent: false });

  const [userRow] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, notifRow.userId))
    .limit(1);
  signal.throwIfAborted();
  const recipientName = userRow?.name ?? "there";

  const rendered = renderNotificationEmail(notifRow, recipientName);
  const message: SystemMessage = {
    to: [account.emailAddress],
    subject: rendered.subject,
    bodyHtml: rendered.html,
    bodyText: rendered.text,
    idempotencyKey: notifRow.id,
  };

  const sendFn = deps.send ?? sendGmail;
  const mailboxRow: EmailAccountRow = {
    id: account.id,
    userId: notifRow.userId,
    emailAddress: account.emailAddress,
  };
  const sent = await sendFn(mailboxRow, message, signal);
  if (sent.ok !== true) return sent;

  await db
    .update(notifications)
    .set({ emailSentAt: new Date() })
    .where(eq(notifications.id, notifRow.id));
  signal.throwIfAborted();
  return ok({ sent: true });
}

export async function registerEmailNotificationWorker(boss: PgBoss): Promise<void> {
  const { db } = await import("@/db/client");

  await boss.createQueue(EMAIL_NOTIFICATION_QUEUE);

  await boss.work(
    EMAIL_NOTIFICATION_QUEUE,
    async ([job]: Array<{ data: { notificationId: string } }>) => {
      if (job === undefined) return;
      const signal = AbortSignal.timeout(30_000);
      const r = await runEmailNotificationJob(db, job.data, signal);
      if (r.ok !== true) {
        throw new AppError(r.error.id, "email notification job failed", {
          notificationId: job.data.notificationId,
        });
      }
    },
  );
}
