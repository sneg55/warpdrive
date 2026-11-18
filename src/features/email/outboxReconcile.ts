import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import type { MailProvider } from "./provider/types";

async function findPriorSend(
  provider: MailProvider,
  messageIdHeader: string,
  signal: AbortSignal,
): Promise<Result<string | null, AppError>> {
  if (provider.gmail === null) return ok(null);
  const found = await provider.gmail.searchByRfc822({ messageIdHeader, signal });
  signal.throwIfAborted();
  if (!found.ok) return found;
  return ok(found.value.messages[0]?.id ?? null);
}

export interface AttemptRow {
  id: string;
  status: string;
  message_id_header: string;
  send_started_at: string | null;
  claim_token: string | null;
  gmail_message_id: string | null;
}

export type SendOutcome = {
  status: "sent" | "sending" | "failed" | "needs_review" | "waiting_for_limit";
  gmailMessageId?: string;
};

export async function markSent(
  db: Db,
  attemptId: string,
  gmailMessageId: string,
  signal: AbortSignal,
): Promise<void> {
  await db.execute(sql`
    UPDATE email_send_attempts
    SET status='sent', gmail_message_id=${gmailMessageId}, sent_at=now(), error_id=NULL
    WHERE id=${attemptId}
      AND status <> 'sent'
      AND (gmail_message_id IS NULL OR gmail_message_id = ${gmailMessageId})
  `);
  signal.throwIfAborted();
}

export async function reconcile(
  db: Db,
  args: {
    attempt: AttemptRow;
    provider: MailProvider;
    signal: AbortSignal;
    now: number;
    windowMs: number;
  },
): Promise<Result<SendOutcome, AppError>> {
  const found = await findPriorSend(args.provider, args.attempt.message_id_header, args.signal);
  if (!found.ok) return found;

  const hitId = found.value;
  if (hitId !== null) {
    await markSent(db, args.attempt.id, hitId, args.signal);
    return ok({ status: "sent", gmailMessageId: hitId });
  }

  const startedAt = args.attempt.send_started_at;
  const startedMs = startedAt !== null ? new Date(startedAt).getTime() : args.now;
  const deadline = startedMs + args.windowMs;
  if (args.now < deadline) {
    return err(
      new AppError("E_GMAIL_007", "reconcile still settling, retry", {
        attemptId: args.attempt.id,
      }),
    );
  }

  await db.execute(sql`
    UPDATE email_send_attempts
    SET status='needs_review', error_id='E_GMAIL_004'
    WHERE id=${args.attempt.id}
  `);
  args.signal.throwIfAborted();
  return ok({ status: "needs_review" });
}
