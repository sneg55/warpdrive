/**
 * scripts/seed-smoke.ts
 *
 * Idempotent fixture seeder for the Phase 4 agent-browser smoke test.
 * Run: pnpm db:seed:smoke
 *
 * Prints to stderr on success (console.warn per project lint rules):
 *   smoke_email=<email>
 *   smoke_thread_id=<uuid>
 *   smoke_open_token=<token>
 *
 * Running twice must not error or duplicate rows.
 */

import { Pool } from "pg";
import {
  BASE_CURRENCY,
  DATABASE_URL,
  SMOKE_EMAIL,
  SMOKE_GMAIL_THREAD_ID,
  SMOKE_GOOGLE_SUB,
  SMOKE_IDEMPOTENCY_KEY,
  SMOKE_INBOUND_BODY_HTML,
  SMOKE_MESSAGE_ID_HEADER,
  SMOKE_MSG_IN_ID,
  SMOKE_MSG_OUT_ID,
  SMOKE_OPEN_TOKEN,
  SMOKE_PIPELINE_NAME,
  SMOKE_STAGE_NAME,
} from "./seed-smoke-config";

const pool = new Pool({ connectionString: DATABASE_URL });

async function q<T extends Record<string, unknown>>(
  text: string,
  values?: unknown[],
): Promise<T[]> {
  const result = await pool.query(text, values);
  return result.rows as T[];
}

async function seedUser(): Promise<string> {
  const rows = await q<{ id: string }>(
    `INSERT INTO users (email, name, google_sub, is_admin, is_active)
     VALUES ($1, $2, $3, true, true)
     ON CONFLICT (email) DO UPDATE
       SET google_sub = EXCLUDED.google_sub,
           is_admin   = true,
           is_active  = true,
           updated_at = now()
     RETURNING id`,
    [SMOKE_EMAIL, "Smoke Test User", SMOKE_GOOGLE_SUB],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("user upsert returned no row");
  return row.id;
}

async function seedSettings(): Promise<void> {
  await q(
    `INSERT INTO settings (id, base_currency, email_tracking_default_enabled)
     VALUES (true, $1, true)
     ON CONFLICT (id) DO UPDATE
       SET email_tracking_default_enabled = true,
           base_currency = $1,
           updated_at    = now()`,
    [BASE_CURRENCY],
  );
}

async function seedPerson(ownerId: string): Promise<string> {
  const existing = await q<{ id: string }>(
    `SELECT id FROM persons WHERE primary_email = $1 AND deleted_at IS NULL LIMIT 1`,
    ["jane@acme.com"],
  );
  if (existing[0] !== undefined) return existing[0].id;

  const rows = await q<{ id: string }>(
    `INSERT INTO persons (name, primary_email, owner_id, visibility_level)
     VALUES ($1, $2, $3, 'all')
     RETURNING id`,
    ["Jane Roe", "jane@acme.com", ownerId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("person insert returned no row");
  return row.id;
}

async function seedPipelineAndStage(): Promise<{ pipelineId: string; stageId: string }> {
  await q(`INSERT INTO pipelines (name, "order") VALUES ($1, 0) ON CONFLICT DO NOTHING`, [
    SMOKE_PIPELINE_NAME,
  ]);
  const pFound = await q<{ id: string }>(`SELECT id FROM pipelines WHERE name = $1 LIMIT 1`, [
    SMOKE_PIPELINE_NAME,
  ]);
  const pipelineId = pFound[0]?.id;
  if (pipelineId === undefined) throw new Error("pipeline not found after upsert");

  const existingStage = await q<{ id: string }>(
    `SELECT id FROM stages WHERE pipeline_id = $1 AND name = $2 LIMIT 1`,
    [pipelineId, SMOKE_STAGE_NAME],
  );
  if (existingStage[0] !== undefined) {
    return { pipelineId, stageId: existingStage[0].id };
  }

  const sRows = await q<{ id: string }>(
    `INSERT INTO stages (pipeline_id, name, "order", probability)
     VALUES ($1, $2, 0, 50) RETURNING id`,
    [pipelineId, SMOKE_STAGE_NAME],
  );
  const stageId = sRows[0]?.id;
  if (stageId === undefined) throw new Error("stage insert returned no row");
  return { pipelineId, stageId };
}

async function seedDeal(
  personId: string,
  pipelineId: string,
  stageId: string,
  ownerId: string,
): Promise<string> {
  const existing = await q<{ id: string }>(
    `SELECT id FROM deals
     WHERE title = 'Acme renewal' AND person_id = $1 AND status = 'open' AND deleted_at IS NULL
     LIMIT 1`,
    [personId],
  );
  if (existing[0] !== undefined) return existing[0].id;

  const rows = await q<{ id: string }>(
    `INSERT INTO deals
       (title, status, pipeline_id, stage_id, person_id, owner_id, visibility_level, board_position)
     VALUES ($1, 'open', $2, $3, $4, $5, 'all', 0)
     RETURNING id`,
    ["Acme renewal", pipelineId, stageId, personId, ownerId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("deal insert returned no row");
  return row.id;
}

async function seedEmailAccount(userId: string): Promise<string> {
  const rows = await q<{ id: string }>(
    `INSERT INTO email_accounts (user_id, email_address, status, last_history_id)
     VALUES ($1, $2, 'connected', '1000')
     ON CONFLICT (user_id) DO UPDATE
       SET status          = 'connected',
           last_history_id = '1000',
           updated_at      = now()
     RETURNING id`,
    [userId, SMOKE_EMAIL],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("email_account upsert returned no row");
  return row.id;
}

async function seedEmailThread(
  accountId: string,
  personId: string,
  dealId: string,
): Promise<string> {
  const rows = await q<{ id: string }>(
    `INSERT INTO email_threads
       (gmail_thread_id, account_id, subject, visibility, person_id, deal_id, last_message_at)
     VALUES ($1, $2, $3, 'shared', $4, $5, now())
     ON CONFLICT ON CONSTRAINT uq_thread_acct_gmail DO UPDATE
       SET subject         = EXCLUDED.subject,
           visibility      = 'shared',
           person_id       = EXCLUDED.person_id,
           deal_id         = EXCLUDED.deal_id,
           last_message_at = now(),
           updated_at      = now()
     RETURNING id`,
    [SMOKE_GMAIL_THREAD_ID, accountId, "Acme renewal", personId, dealId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("email_thread upsert returned no row");
  return row.id;
}

async function seedEmailMessages(threadId: string, accountId: string): Promise<string> {
  await q(
    `INSERT INTO email_messages
       (thread_id, account_id, gmail_message_id, direction, from_email,
        to_emails, subject, body_html, sent_at)
     VALUES ($1,$2,$3,'inbound','jane@acme.com',$4::jsonb,'Acme renewal',$5,now()-interval '1 hour')
     ON CONFLICT ON CONSTRAINT uq_msg_acct_gmail DO UPDATE SET direction='inbound'`,
    [threadId, accountId, SMOKE_MSG_IN_ID, JSON.stringify([SMOKE_EMAIL]), SMOKE_INBOUND_BODY_HTML],
  );

  const outRows = await q<{ id: string }>(
    `INSERT INTO email_messages
       (thread_id, account_id, gmail_message_id, direction, from_email,
        to_emails, subject, body_html, tracking_enabled, sent_at)
     VALUES ($1,$2,$3,'outbound',$4,$5::jsonb,'Re: Acme renewal','<p>thanks Jane</p>',true,now())
     ON CONFLICT ON CONSTRAINT uq_msg_acct_gmail DO UPDATE
       SET tracking_enabled=true
     RETURNING id`,
    [threadId, accountId, SMOKE_MSG_OUT_ID, SMOKE_EMAIL, JSON.stringify(["jane@acme.com"])],
  );
  const outRow = outRows[0];
  if (outRow === undefined) throw new Error("outbound message upsert returned no row");
  return outRow.id;
}

async function seedTrackingToken(
  accountId: string,
  threadId: string,
  outboundMessageId: string,
): Promise<void> {
  const attemptRows = await q<{ id: string }>(
    `INSERT INTO email_send_attempts
       (idempotency_key, message_id_header, account_id, thread_id, payload, status, sent_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,'sent',now())
     ON CONFLICT ON CONSTRAINT uq_attempt_acct_key DO UPDATE SET status='sent', sent_at=now()
     RETURNING id`,
    [
      SMOKE_IDEMPOTENCY_KEY,
      SMOKE_MESSAGE_ID_HEADER,
      accountId,
      threadId,
      JSON.stringify({ to: ["jane@acme.com"], subject: "Re: Acme renewal" }),
    ],
  );
  const attemptId = attemptRows[0]?.id;
  if (attemptId === undefined) throw new Error("send_attempt upsert returned no row");

  await q(
    `INSERT INTO email_tracking_tokens
       (token, send_attempt_id, message_id, recipient, kind)
     VALUES ($1,$2,$3,'jane@acme.com','open')
     ON CONFLICT (token) DO UPDATE
       SET send_attempt_id=EXCLUDED.send_attempt_id,
           message_id=EXCLUDED.message_id`,
    [SMOKE_OPEN_TOKEN, attemptId, outboundMessageId],
  );
}

async function main(): Promise<void> {
  const userId = await seedUser();
  await seedSettings();
  const personId = await seedPerson(userId);
  const { pipelineId, stageId } = await seedPipelineAndStage();
  const dealId = await seedDeal(personId, pipelineId, stageId, userId);
  const accountId = await seedEmailAccount(userId);
  const threadId = await seedEmailThread(accountId, personId, dealId);
  const outboundId = await seedEmailMessages(threadId, accountId);
  await seedTrackingToken(accountId, threadId, outboundId);

  // console.warn is allowed by project lint rules (no-console allows warn/error).
  console.warn(`smoke_email=${SMOKE_EMAIL}`);
  console.warn(`smoke_thread_id=${threadId}`);
  console.warn(`smoke_open_token=${SMOKE_OPEN_TOKEN}`);
}

main()
  .catch((e: unknown) => {
    console.error("seed-smoke failed:", e);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });
