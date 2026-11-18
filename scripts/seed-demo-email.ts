import { formatUserName } from "@/features/identity/formatUserName";
import { pick, type Rng, randInt } from "./seed-demo-data";
import type { Db } from "./seed-smoke-phase5-infra";

const SUBJECTS = [
  "Intro and next steps",
  "Proposal for your team",
  "Following up",
  "Contract for review",
  "Quick question on pricing",
  "Renewal discussion",
  "Meeting recap",
  "Onboarding schedule",
  "Re: your inquiry",
  "Checking in",
] as const;

const DAY_MS = 86_400_000;

const FOLLOW_UP_OPTS = ["waiting", "replied", "closed"] as const;
const THREAD_LABELS = ["important", "to_do", "later"] as const;
const ATTACHMENTS: readonly (readonly [string, string])[] = [
  ["Proposal.pdf", "application/pdf"],
  ["Contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["Pricing.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["Logo.png", "image/png"],
  ["Deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
] as const;

type UserEmailArgs = {
  accountUserId: string;
  userEmail: string;
  rng: Rng;
  personEmails: string[];
  personIds: string[];
  dealIds: string[];
  count: number;
};

type ThreadCtx = {
  threadId: string;
  accountId: string;
  userKey: string;
  userEmail: string;
  counterEmail: string;
  subject: string;
  rng: Rng;
};

function displayNameFromEmail(email: string): string | null {
  const at = email.indexOf("@");
  const local = at > 0 ? email.slice(0, at) : email;
  const cleaned = local.replace(/[0-9]+/g, "");
  if (!/[a-z]/i.test(cleaned)) return null;
  return formatUserName(`${cleaned}@demo`);
}

async function insertMessages(
  db: Db,
  ctx: ThreadCtx,
  startIdx: number,
  n: number,
  baseMs: number,
): Promise<number> {
  let lastSentMs = baseMs;
  for (let k = 0; k < n; k += 1) {
    const inbound = k % 2 === 0;
    lastSentMs = baseMs + k * randInt(ctx.rng, 1, 6) * 3_600_000;
    const to = inbound ? [ctx.userEmail] : [ctx.counterEmail];
    const [msg] = await db.q<{ id: string }>(
      `INSERT INTO email_messages
         (thread_id, account_id, gmail_message_id, direction, from_email, from_name,
          to_emails, subject, snippet, body_html, body_text, tracking_enabled, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,to_timestamp($13))
       RETURNING id`,
      [
        ctx.threadId,
        ctx.accountId,
        `demo-${ctx.userKey}-m${startIdx + k}`,
        inbound ? "inbound" : "outbound",
        inbound ? ctx.counterEmail : ctx.userEmail,
        inbound ? displayNameFromEmail(ctx.counterEmail) : null,
        JSON.stringify(to),
        k === 0 ? ctx.subject : `Re: ${ctx.subject}`,
        `${ctx.subject} - message ${k + 1}`,
        `<p>${ctx.subject} - message ${k + 1}. Let me know your thoughts.</p>`,
        `${ctx.subject} - message ${k + 1}. Let me know your thoughts.`,
        !inbound && ctx.rng() < 0.5,
        lastSentMs / 1000,
      ],
    );
    if (msg && inbound && ctx.rng() < 0.35) {
      await insertAttachments(db, ctx, msg.id, startIdx + k);
    }
  }
  return lastSentMs;
}

async function insertAttachments(
  db: Db,
  ctx: ThreadCtx,
  messageId: string,
  idxSeed: number,
): Promise<void> {
  const nAtt = randInt(ctx.rng, 1, 2);
  for (let a = 0; a < nAtt; a += 1) {
    const [filename, mime] = pick(ctx.rng, ATTACHMENTS);
    await db.q(
      `INSERT INTO email_message_attachments
         (message_id, account_id, gmail_attachment_id, filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        messageId,
        ctx.accountId,
        `demo-att-${idxSeed}-${a}`,
        filename,
        mime,
        randInt(ctx.rng, 20, 4096) * 1024,
      ],
    );
  }
}

function threadAttrs(rng: Rng): { followUp: string | null; labels: string[] } {
  const followUp = rng() < 0.3 ? pick(rng, FOLLOW_UP_OPTS) : null;
  const labels: string[] = [];
  if (rng() < 0.25) {
    labels.push(pick(rng, THREAD_LABELS));
    const second = pick(rng, THREAD_LABELS);
    if (rng() < 0.4 && !labels.includes(second)) labels.push(second);
  }
  return { followUp, labels };
}

async function maybeMarkRead(
  db: Db,
  rng: Rng,
  threadId: string,
  userId: string,
  atSec: number,
): Promise<void> {
  if (rng() >= 0.6) return;
  await db.q(
    `INSERT INTO email_thread_reads (thread_id, user_id, read_at)
     VALUES ($1, $2, to_timestamp($3)) ON CONFLICT DO NOTHING`,
    [threadId, userId, atSec],
  );
}

export async function seedUserEmails(db: Db, args: UserEmailArgs): Promise<number> {
  const { accountUserId, userEmail, rng, personEmails, personIds, dealIds, count } = args;
  const [acct] = await db.q<{ id: string }>(
    `INSERT INTO email_accounts (user_id, email_address, status, last_history_id)
     VALUES ($1, $2, 'connected', '1000')
     ON CONFLICT (user_id) DO UPDATE SET status = 'connected', updated_at = now()
     RETURNING id`,
    [accountUserId, userEmail],
  );
  if (!acct) throw new Error(`email_account upsert failed for ${userEmail}`);

  let msgIdx = 0;
  let threadIdx = 0;
  while (msgIdx < count) {
    const inThread = Math.min(count - msgIdx, randInt(rng, 1, 4));
    const subject = pick(rng, SUBJECTS);
    const base = Date.now() - (threadIdx + 1) * 7 * DAY_MS;
    const dealId = dealIds.length > 0 && rng() < 0.4 ? pick(rng, dealIds) : null;
    const visibility = rng() < 0.2 ? "private" : "shared";
    const { followUp, labels } = threadAttrs(rng);
    const [thread] = await db.q<{ id: string }>(
      `INSERT INTO email_threads
         (gmail_thread_id, account_id, subject, visibility, person_id, deal_id,
          last_message_at, follow_up_status, labels)
       VALUES ($1, $2, $3, $4::email_visibility, $5, $6, to_timestamp($7), $8, $9::text[])
       RETURNING id`,
      [
        `demo-${accountUserId}-t${threadIdx}`,
        acct.id,
        subject,
        visibility,
        pick(rng, personIds),
        dealId,
        base / 1000,
        followUp,
        labels,
      ],
    );
    if (!thread) throw new Error("email_thread insert failed");
    const lastSentMs = await insertMessages(
      db,
      {
        threadId: thread.id,
        accountId: acct.id,
        userKey: accountUserId,
        userEmail,
        counterEmail: pick(rng, personEmails),
        subject,
        rng,
      },
      msgIdx,
      inThread,
      base,
    );
    await db.q(`UPDATE email_threads SET last_message_at = to_timestamp($1) WHERE id = $2`, [
      lastSentMs / 1000,
      thread.id,
    ]);
    await maybeMarkRead(db, rng, thread.id, accountUserId, lastSentMs / 1000 + 3600);
    msgIdx += inThread;
    threadIdx += 1;
  }
  return msgIdx;
}
