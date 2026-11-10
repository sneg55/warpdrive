import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { CLAIM_LEASE_SECONDS } from "@/constants/email";
import type { Db } from "@/db/client";
import type { AttemptRow } from "./outboxReconcile";

interface PayloadAttachment {
  fileId: string;
  s3Key: string;
  contentType: string;
  filename: string;
}

export interface SendPayload {
  actorId?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  trackingEnabled?: boolean;
  trackOpens?: boolean;
  trackLinks?: boolean;
  attachments?: PayloadAttachment[];
  linkPersonId?: string | null;
  linkDealId?: string | null;
  visibility?: "private" | "shared" | null;
}

export async function claim(
  db: Db,
  attemptId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const token = randomUUID();
  signal.throwIfAborted();
  const res = await db.execute(sql`
    UPDATE email_send_attempts
    SET claim_token=${token}, claimed_at=now(), status='sending'
    WHERE id=${attemptId}
      AND (
        status IN ('pending','failed')
        OR (status='sending' AND claimed_at < now() - (${CLAIM_LEASE_SECONDS} * interval '1 second'))
      )
      AND (scheduled_at IS NULL OR scheduled_at <= now())
    RETURNING id
  `);
  signal.throwIfAborted();
  return res.rows[0] !== undefined ? token : null;
}

export async function loadAttempt(
  db: Db,
  accountId: string,
  idempotencyKey: string,
  signal: AbortSignal,
): Promise<AttemptRow | undefined> {
  signal.throwIfAborted();
  const res = await db.execute(sql`
    SELECT id, status, message_id_header, send_started_at, claim_token, gmail_message_id
    FROM email_send_attempts
    WHERE account_id=${accountId} AND idempotency_key=${idempotencyKey}
  `);
  signal.throwIfAborted();
  return res.rows[0] as AttemptRow | undefined;
}

export interface SendInputs {
  from: string;
  payload: SendPayload;
  gmailThreadId: string | null;
  parentGmailMessageId: string | null;
}

export async function loadSendInputs(
  db: Db,
  attemptId: string,
  accountId: string,
  signal: AbortSignal,
): Promise<SendInputs | undefined> {
  signal.throwIfAborted();
  const res = await db.execute(sql`
    SELECT a.email_address AS from_email, s.payload, t.gmail_thread_id,
      (
        SELECT m.gmail_message_id FROM email_messages m
        WHERE m.thread_id = t.id AND m.account_id = t.account_id
        ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
        LIMIT 1
      ) AS parent_gmail_message_id
    FROM email_send_attempts s
    JOIN email_accounts a ON a.id = s.account_id
    LEFT JOIN email_threads t ON t.id = s.thread_id AND t.account_id = s.account_id
    WHERE s.id=${attemptId} AND a.id=${accountId}
  `);
  signal.throwIfAborted();
  const row = res.rows[0] as
    | {
        from_email: string;
        payload: SendPayload;
        gmail_thread_id: string | null;
        parent_gmail_message_id: string | null;
      }
    | undefined;
  if (row === undefined) return undefined;
  return {
    from: row.from_email,
    payload: row.payload,
    gmailThreadId: row.gmail_thread_id,
    parentGmailMessageId: row.parent_gmail_message_id,
  };
}

export async function stamp(
  db: Db,
  attemptId: string,
  token: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  const res = await db.execute(sql`
    UPDATE email_send_attempts SET send_started_at=now()
    WHERE id=${attemptId} AND claim_token=${token} AND send_started_at IS NULL
      AND EXISTS (SELECT 1 FROM email_accounts a WHERE a.id=email_send_attempts.account_id AND
        (a.kind='personal' OR EXISTS (SELECT 1 FROM email_account_members am
          WHERE am.account_id=a.id AND am.user_id::text=email_send_attempts.payload->>'actorId')))
    RETURNING id
  `);
  signal.throwIfAborted();
  return res.rows[0] !== undefined;
}
