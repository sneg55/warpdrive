import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { canSeeLinkedDeal, canSeeLinkedPerson } from "./emailVisibility";
import type { GmailClient } from "./gmailClient";
import { resolveOutboundLink } from "./linking";
import type { SendEmailInput } from "./send";

// Context for linking a NEW outbound thread to a CRM person/deal, mirroring the inbound
// auto-link. Optional: when absent (worker paths/tests that do not supply it), the thread is
// created unlinked exactly as before. explicit* come from the composer (e.g. the deal workspace
// passes its deal + primary contact); when both are null we fall back to recipient-based
// resolution. Every explicit FK is re-checked for visibility (never trust a client FK).
export interface OutboundLinkContext {
  owner: AuthUser;
  recipients: string[];
  explicitPersonId: string | null;
  explicitDealId: string | null;
}

export interface StoreOutboundArgs {
  accountId: string;
  fromEmail: string;
  gmailMessageId: string;
  input: SendEmailInput;
  // Resolved tracking flag: true if either trackOpens or trackLinks is on.
  // Callers compute this at the send boundary and pass it here so this function
  // never needs to repeat the resolution logic.
  resolvedTrackingEnabled: boolean;
  bodyHtml: string;
  gmail: GmailClient;
  // Optional: link a NEW thread to a person/deal. Omitted => thread stays unlinked.
  link?: OutboundLinkContext;
  // Optional compose privacy (C1): applied to a NEW thread only. Omitted => DB default ("private").
  // A reply threads into an existing row and never changes its visibility.
  visibility?: "private" | "shared" | null;
  signal: AbortSignal;
}

// Store the outbound CRM copy after a successful send. SendOutcome only carries the
// gmail message id, NOT the gmail threadId, so we fetch the full message (works for
// both the direct-send and reconcile-adopted paths) to learn its threadId + snippet.
// The composite FK (thread_id, account_id) requires the thread ROW to exist before the
// message insert, so we upsert the thread first. Returns the local message id.
export async function storeOutboundCopy(
  db: Db,
  args: StoreOutboundArgs,
): Promise<Result<{ messageId: string }, AppError>> {
  const fetched = await args.gmail.getMessage({ id: args.gmailMessageId, signal: args.signal });
  args.signal.throwIfAborted();
  if (!fetched.ok) return fetched;
  const gmailThreadId = fetched.value.threadId;
  const snippet = fetched.value.snippet ?? null;

  const thread = await upsertThread(db, {
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

  const inserted = await db.execute(sql`
    INSERT INTO email_messages
      (thread_id, account_id, gmail_message_id, direction, from_email, to_emails, cc_emails, subject, snippet, body_html, sent_at, tracking_enabled)
    VALUES (
      ${localThreadId}, ${args.accountId}, ${args.gmailMessageId}, 'outbound', ${args.fromEmail},
      ${JSON.stringify(args.input.to)}::jsonb, ${JSON.stringify(args.input.cc ?? [])}::jsonb,
      ${args.input.subject}, ${snippet}, ${args.bodyHtml}, now(), ${args.resolvedTrackingEnabled}
    )
    ON CONFLICT (account_id, gmail_message_id) DO UPDATE SET snippet=EXCLUDED.snippet
    RETURNING id
  `);
  args.signal.throwIfAborted();
  const row = inserted.rows[0] as { id: string } | undefined;
  if (row === undefined) {
    return err(new AppError("E_DB_002", "outbound copy insert returned no row", {}));
  }
  return ok({ messageId: row.id });
}

// Resolve the person/deal a NEW outbound thread should link to. Explicit context from the
// composer wins but is re-verified for visibility (never trust a client FK); when the composer
// supplies neither, fall back to recipient-based auto-resolution (mirrors inbound auto-link).
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
  // Fall back to recipient-based resolution for whatever the composer did NOT pin down. The
  // deal workspace passes only its dealId, so this fills in the person from the recipient while
  // keeping the explicit deal.
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

// Upsert the thread on (account_id, gmail_thread_id) and return the local id. A reply threads
// into an EXISTING conversation: preserve its link and never re-resolve (a manual link or a
// prior auto-link must stand). Only a genuinely NEW thread resolves person/deal from the link
// context. The INSERT keeps ON CONFLICT DO UPDATE so a concurrent send that created the row
// first never clobbers its link (DO UPDATE touches only updated_at).
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
  const found = existing.rows[0] as { id: string } | undefined;
  if (found !== undefined) {
    await db.execute(sql`UPDATE email_threads SET updated_at=now() WHERE id=${found.id}`);
    return ok(found.id);
  }

  const { personId, dealId } =
    args.link === undefined
      ? { personId: null, dealId: null }
      : await resolveNewThreadLink(db, args.fromEmail, args.link, args.signal);

  // Apply the composer's visibility to the new thread; fall back to the column default ('private')
  // when the caller did not supply one (old rows, reply paths). COALESCE keeps the default in one
  // place rather than branching the SQL.
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
