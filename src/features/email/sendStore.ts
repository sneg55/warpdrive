import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { canSeeLinkedDeal, canSeeLinkedPerson } from "./emailVisibility";
import type { GmailClient } from "./gmailClient";
import { resolveOutboundLink } from "./linking";
import type { SendEmailInput } from "./send";
import { publishTeamThreadUpdated } from "./teamMailboxEvents";

interface OutboundLinkContext {
  owner: AuthUser;
  recipients: string[];
  explicitPersonId: string | null;
  explicitDealId: string | null;
}

export interface StoreOutboundArgs {
  sentByUserId?: string;
  accountId: string;
  fromEmail: string;
  gmailMessageId: string;
  input: SendEmailInput;
  resolvedTrackingEnabled: boolean;
  bodyHtml: string;
  gmail: GmailClient;
  link?: OutboundLinkContext;
  visibility?: "private" | "shared" | null;
  signal: AbortSignal;
}

export async function storeOutboundCopy(
  db: Db,
  args: StoreOutboundArgs,
): Promise<Result<{ messageId: string }, AppError>> {
  const fetched = await args.gmail.getMessage({ id: args.gmailMessageId, signal: args.signal });
  args.signal.throwIfAborted();
  if (!fetched.ok) return fetched;
  const gmailThreadId = fetched.value.threadId;
  const snippet = fetched.value.snippet ?? null;

  return db.transaction(async (tx) => {
    const thread = await upsertThread(tx, {
      accountId: args.accountId,
      gmailThreadId,
      subject: args.input.subject,
      fromEmail: args.fromEmail,
      link: args.link,
      visibility: args.visibility,
      signal: args.signal,
    });
    if (!thread.ok) return thread;
    const localThreadId = thread.value;

    const inserted = await tx.execute(sql`
    INSERT INTO email_messages
      (thread_id, account_id, gmail_message_id, direction, from_email, to_emails, cc_emails, subject, snippet, body_html, sent_at, tracking_enabled, sent_by_user_id)
    VALUES (
      ${localThreadId}, ${args.accountId}, ${args.gmailMessageId}, 'outbound', ${args.fromEmail},
      ${JSON.stringify(args.input.to)}::jsonb, ${JSON.stringify(args.input.cc ?? [])}::jsonb,
      ${args.input.subject}, ${snippet}, ${args.bodyHtml}, now(), ${args.resolvedTrackingEnabled}, COALESCE(${args.sentByUserId ?? null}::uuid, (SELECT user_id FROM email_accounts WHERE id=${args.accountId}))
    )
    ON CONFLICT (account_id, gmail_message_id) DO UPDATE SET snippet=EXCLUDED.snippet, direction='outbound', sent_by_user_id=EXCLUDED.sent_by_user_id
    RETURNING id
  `);
    args.signal.throwIfAborted();
    const row = inserted.rows[0] as { id: string } | undefined;
    if (row === undefined) {
      return err(new AppError("E_DB_002", "outbound copy insert returned no row", {}));
    }
    await publishTeamThreadUpdated(tx, localThreadId, args.sentByUserId ?? null, args.signal);
    return ok({ messageId: row.id });
  });
}

async function resolveNewThreadLink(
  db: Db,
  fromEmail: string,
  link: OutboundLinkContext,
  signal: AbortSignal,
): Promise<{ personId: string | null; dealId: string | null }> {
  let personId: string | null = null;
  let dealId: string | null = null;
  if (
    link.explicitPersonId !== null &&
    (await canSeeLinkedPerson(db, link.owner, link.explicitPersonId, signal))
  ) {
    personId = link.explicitPersonId;
  }
  if (
    link.explicitDealId !== null &&
    (await canSeeLinkedDeal(db, link.owner, link.explicitDealId, signal))
  ) {
    dealId = link.explicitDealId;
  }
  if (personId === null || dealId === null) {
    const outcome = await resolveOutboundLink(
      db,
      { owner: link.owner, fromEmail, recipients: link.recipients },
      signal,
    );
    if (outcome.kind === "linked") {
      if (personId === null) personId = outcome.personId;
      if (dealId === null) dealId = outcome.dealId;
    }
  }
  return { personId, dealId };
}

async function upsertThread(
  db: Db,
  args: {
    accountId: string;
    gmailThreadId: string;
    subject: string;
    fromEmail: string;
    link: OutboundLinkContext | undefined;
    visibility?: "private" | "shared" | null;
    signal: AbortSignal;
  },
): Promise<Result<string, AppError>> {
  const existing = await db.execute(
    sql`SELECT id FROM email_threads WHERE account_id=${args.accountId} AND gmail_thread_id=${args.gmailThreadId}`,
  );
  args.signal.throwIfAborted();
  const found = existing.rows[0] as { id: string } | undefined;
  if (found !== undefined) {
    await db.execute(sql`UPDATE email_threads SET updated_at=now() WHERE id=${found.id}`);
    args.signal.throwIfAborted();
    return ok(found.id);
  }

  const { personId, dealId } =
    args.link === undefined
      ? { personId: null, dealId: null }
      : await resolveNewThreadLink(db, args.fromEmail, args.link, args.signal);

  const visibility = args.visibility ?? null;
  const created = await db.execute(sql`
    INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, deal_id, visibility, last_message_at)
    VALUES (
      ${args.gmailThreadId}, ${args.accountId}, ${args.subject}, ${personId}, ${dealId},
      COALESCE(${visibility}::email_visibility, 'private'), now()
    )
    ON CONFLICT (account_id, gmail_thread_id) DO UPDATE SET updated_at=now()
    RETURNING id
  `);
  args.signal.throwIfAborted();
  const row = created.rows[0] as { id: string } | undefined;
  if (row === undefined) {
    return err(
      new AppError("E_DB_002", "email_threads upsert returned no row", {
        gmailThreadId: args.gmailThreadId,
      }),
    );
  }
  return ok(row.id);
}
