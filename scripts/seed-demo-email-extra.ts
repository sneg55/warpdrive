/**
 * scripts/seed-demo-email-extra.ts
 *
 * Email open/click tracking (send attempt -> token -> events) for a sample of
 * outbound demo messages, plus non-connected account states (error/disconnected).
 */

import { type Rng, randInt } from "./seed-demo-data";
import type { Db } from "./seed-smoke-phase5-infra";

type OutMsg = { id: string; account_id: string; thread_id: string; recipient: string | null };

// Records opens (and some clicks) against tracked outbound messages so the email
// UI shows "seen" state. Returns the number of tracking events created.
export async function seedEmailTracking(db: Db, rng: Rng, userIds: string[]): Promise<number> {
  const msgs = await db.q<OutMsg>(
    `SELECT m.id, m.account_id, m.thread_id, (m.to_emails->>0) AS recipient
       FROM email_messages m
       JOIN email_accounts a ON a.id = m.account_id
      WHERE a.user_id = ANY($1::uuid[]) AND m.direction = 'outbound' AND m.tracking_enabled = true
      ORDER BY m.sent_at DESC LIMIT 60`,
    [userIds],
  );
  let events = 0;
  let i = 0;
  for (const m of msgs) {
    const recipient = m.recipient ?? "unknown@example.com";
    i += 1;
    const [attempt] = await db.q<{ id: string }>(
      `INSERT INTO email_send_attempts
         (idempotency_key, message_id_header, account_id, thread_id, payload, status, gmail_message_id, sent_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, 'sent', $5, now())
       RETURNING id`,
      [
        `<demo-track-${i}@warpdrive.local>`,
        m.account_id,
        m.thread_id,
        JSON.stringify({ to: [recipient] }),
        m.id,
      ],
    );
    if (!attempt) continue;
    const [tok] = await db.q<{ id: string }>(
      `INSERT INTO email_tracking_tokens (token, send_attempt_id, message_id, recipient, kind)
       VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
      [`demotrk${i}`, attempt.id, m.id, recipient],
    );
    if (!tok) continue;
    // 0-3 opens per tracked message; ~30% also register a click.
    for (let k = 0; k < randInt(rng, 0, 3); k += 1) {
      await db.q(
        `INSERT INTO email_tracking_events (token_id, message_id, event_type, recipient, user_agent, occurred_at)
         VALUES ($1, $2, 'open', $3, 'Mozilla/5.0 (demo)', now() - ($4::int * interval '1 hour'))`,
        [tok.id, m.id, recipient, randInt(rng, 1, 72)],
      );
      events += 1;
    }
    if (rng() < 0.3) {
      const [ctok] = await db.q<{ id: string }>(
        `INSERT INTO email_tracking_tokens (token, send_attempt_id, message_id, recipient, kind, target_url)
         VALUES ($1, $2, $3, $4, 'click', 'https://warpdrive.example/pricing') RETURNING id`,
        [`democlk${i}`, attempt.id, m.id, recipient],
      );
      if (ctok) {
        await db.q(
          `INSERT INTO email_tracking_events (token_id, message_id, event_type, recipient, target_url, user_agent, occurred_at)
           VALUES ($1, $2, 'click', $3, 'https://warpdrive.example/pricing', 'Mozilla/5.0 (demo)', now())`,
          [ctok.id, m.id, recipient],
        );
        events += 1;
      }
    }
  }
  return events;
}

// Puts two demo mailboxes into non-connected states so the accounts UI shows the
// error/disconnected banners. Expects the full demo user-id list (5 users).
export async function seedAccountStates(db: Db, userIds: string[]): Promise<void> {
  const errUser = userIds[3];
  const discUser = userIds[4];
  if (errUser !== undefined) {
    await db.q(
      `UPDATE email_accounts SET status = 'error', last_error_id = 'E_GMAIL_001', updated_at = now()
       WHERE user_id = $1`,
      [errUser],
    );
  }
  if (discUser !== undefined) {
    await db.q(
      `UPDATE email_accounts SET status = 'disconnected', updated_at = now() WHERE user_id = $1`,
      [discUser],
    );
  }
}
