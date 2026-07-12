import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { CLAIM_LEASE_SECONDS } from "@/constants/email";
import type { Db } from "@/db/client";
import type { AttemptRow } from "./outboxReconcile";

// Attachment metadata persisted in the payload so processSendAttempt can rebuild
// the MIME on replay without re-querying files or re-authorizing the actor.
export interface PayloadAttachment {
  fileId: string;
  s3Key: string;
  contentType: string;
  filename: string;
}

export interface SendPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  // back-compat: old rows may have trackingEnabled; new rows use trackOpens/trackLinks
  trackingEnabled?: boolean;
  trackOpens?: boolean;
  trackLinks?: boolean;
  // Phase 6: attachment metadata resolved at send time, stored for replay.
  attachments?: PayloadAttachment[];
  // Explicit CRM link context from the composer (see SendEmailInput.linkPersonId/linkDealId).
  // Persisted so a SCHEDULED send can restore it in the worker path (performWorkerSendCrm),
  // which has no in-scope access to the original SendEmailInput. Re-verified for visibility
  // downstream via canSeeLinkedPerson/canSeeLinkedDeal, never trusted blindly.
  linkPersonId?: string | null;
  linkDealId?: string | null;
  // Compose privacy (C1). Persisted so the worker (performWorkerSendCrm) and replay-repair CRM-copy
  // paths create a NEW thread with the visibility the author picked, instead of the DB default.
  // Applied to new threads only; null/undefined => DB default. Old rows lack the field.
  visibility?: "private" | "shared" | null;
}

// Token-guarded claim: lease the attempt so a dead worker's claim can be reclaimed
// after CLAIM_LEASE_SECONDS. Returns the claim token on success, null if not claimable.
export async function claim(
  db: Db,
  attemptId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const token = randomUUID();
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
): Promise<AttemptRow | undefined> {
  const res = await db.execute(sql`
    SELECT id, status, message_id_header, send_started_at, claim_token, gmail_message_id
    FROM email_send_attempts
    WHERE account_id=${accountId} AND idempotency_key=${idempotencyKey}
  `);
  return res.rows[0] as AttemptRow | undefined;
}

// Load the From address and the queued payload together (both needed to build MIME).
export async function loadSendInputs(
  db: Db,
  attemptId: string,
  accountId: string,
): Promise<{ from: string; payload: SendPayload } | undefined> {
  const res = await db.execute(sql`
    SELECT a.email_address AS from_email, s.payload
    FROM email_send_attempts s JOIN email_accounts a ON a.id = s.account_id
    WHERE s.id=${attemptId} AND a.id=${accountId}
  `);
  const row = res.rows[0] as { from_email: string; payload: SendPayload } | undefined;
  if (row === undefined) return undefined;
  return { from: row.from_email, payload: row.payload };
}

// Stamp send_started_at in a standalone committed UPDATE BEFORE any Gmail I/O, guarded
// by the claim token and send_started_at IS NULL. 0 rows -> another worker raced us.
export async function stamp(
  db: Db,
  attemptId: string,
  token: string,
  signal: AbortSignal,
): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE email_send_attempts SET send_started_at=now()
    WHERE id=${attemptId} AND claim_token=${token} AND send_started_at IS NULL
    RETURNING id
  `);
  signal.throwIfAborted();
  return res.rows[0] !== undefined;
}
