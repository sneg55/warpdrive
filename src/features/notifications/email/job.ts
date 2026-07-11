import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { AppError } from "@/constants/errorIds";
import { EMAIL_NOTIFICATION_QUEUE } from "@/constants/jobNames";
import type { Db } from "@/db/client";
import { emailAccounts, notifications, users } from "@/db/schema";
import type { SystemMessage } from "@/features/email/sendSystem";
import { sendGmail } from "@/features/email/sendSystem";
import { hydrateOwner } from "@/features/email/syncCursor";
import { canActorAccessParent } from "@/features/files/fileAuthz";
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

  // (a) Load the notification row.
  const [row] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, data.notificationId))
    .limit(1);
  signal.throwIfAborted();
  if (row === undefined) return ok({ sent: false });

  // Idempotency guard (F36): pg-boss is at-least-once, so a job can re-run after a crash
  // between Gmail accepting the message and the job being acknowledged. If this row was
  // already emailed, skip rather than send a duplicate.
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

  // (b) Hydrate the recipient as an AuthUser for visibility checks.
  const recipientResult = await hydrateOwner(db, notifRow.userId, signal);
  if (recipientResult.ok !== true) return recipientResult;
  const recipientUser = recipientResult.value;

  // (c) RE-CHECK visibility at send time: the security core.
  // A notification queued while the entity was visible may have become invisible.
  if (notifRow.entityType !== null && notifRow.entityId !== null) {
    const canSee = await canActorAccessParent(
      db,
      recipientUser,
      notifRow.entityType,
      notifRow.entityId,
      signal,
    );
    signal.throwIfAborted();
    if (canSee !== true) return ok({ sent: false }); // DROP: now-invisible
  }

  // (c2) RE-CHECK the email delivery preference at send time (F35): a preference resolved at
  // enqueue can be revoked before the job runs. If email delivery is no longer enabled for
  // this type, drop the send.
  const delivery = await resolveDelivery(db, notifRow.userId, notifRow.type, signal);
  signal.throwIfAborted();
  if (delivery.email !== true) return ok({ sent: false }); // DROP: opted out

  // (d) Load the recipient's connected mailbox.
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

  // Check status is 'connected' (queried separately to use the typed enum column).
  const [statusRow] = await db
    .select({ status: emailAccounts.status })
    .from(emailAccounts)
    .where(eq(emailAccounts.id, account.id))
    .limit(1);
  signal.throwIfAborted();
  if (statusRow === undefined || statusRow.status !== "connected") return ok({ sent: false });

  // (e) Load the recipient's display name.
  const [userRow] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, notifRow.userId))
    .limit(1);
  signal.throwIfAborted();
  const recipientName = userRow?.name ?? "there";

  // (f) Render and build the SystemMessage.
  const rendered = renderNotificationEmail(notifRow, recipientName);
  const message: SystemMessage = {
    to: [account.emailAddress],
    subject: rendered.subject,
    bodyHtml: rendered.html,
    bodyText: rendered.text,
    // Stable key so a retry reuses the same RFC822 Message-ID (F36): a duplicate that slips
    // through the marker race is at least dedupable by the recipient's mail client.
    idempotencyKey: notifRow.id,
  };

  // (g) Send via the injected send function (defaults to production sendGmail).
  const sendFn = deps.send ?? sendGmail;
  const mailboxRow: EmailAccountRow = {
    id: account.id,
    userId: account.userId,
    emailAddress: account.emailAddress,
  };
  const sent = await sendFn(mailboxRow, message, signal);
  if (sent.ok !== true) return sent;

  // Persist the delivery marker so a later at-least-once retry short-circuits above (F36).
  //
  // Accepted residual (F38): if the worker dies in the window between Gmail accepting the
  // message above and this marker committing, a retry re-sends. This is a deliberate
  // tradeoff, not a defect. Marking BEFORE send would instead DROP notifications on ordinary
  // transient Gmail failures (far more common than a mid-window crash), and a full
  // reconcile-by-Message-ID state machine is disproportionate for a notification email. The
  // stable idempotencyKey above makes any such duplicate carry an identical RFC822
  // Message-ID, so the recipient's mail client collapses it.
  await db
    .update(notifications)
    .set({ emailSentAt: new Date() })
    .where(eq(notifications.id, notifRow.id));
  signal.throwIfAborted();
  return ok({ sent: true });
}

// Register the email notification worker on pg-boss.
// Follows the exact pattern in src/features/email/workerJobs.ts.
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
