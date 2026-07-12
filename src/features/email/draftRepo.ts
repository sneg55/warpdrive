import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import type { EmailVisibility } from "./threadVisibility";

export interface DraftInput {
  id?: string;
  accountId: string;
  threadId?: string | null;
  subject: string;
  bodyHtml: string;
  toEmails: string[];
  ccEmails: string[];
  // Compose privacy in progress. Omitted defaults to "shared" (the column default) so an old draft
  // or a caller that does not set it still round-trips a valid value.
  visibility?: EmailVisibility;
}

export interface DraftSummary {
  id: string;
  subject: string | null;
  bodyHtml: string | null;
  toEmails: string[];
  ccEmails: string[];
  threadId: string | null;
  accountId: string;
  visibility: EmailVisibility;
  updatedAt: string;
}

// Upsert a draft. The action layer confirms accountId ownership (assertMailboxOwner) before
// calling. INSERT for a new draft; when id is given, UPDATE only the row that already lives
// on this same account (an id owned by another mailbox is left untouched: no-op, not an error,
// because saveDraft is idempotent by design and ownership was checked upstream).
export async function saveDraft(
  db: Db,
  args: { actor: AuthUser; draft: DraftInput },
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();
  const d = args.draft;
  // When a threadId is supplied, verify it lives on this same account BEFORE the write, so a
  // foreign/nonexistent id returns a typed error instead of letting the composite FK throw.
  if (d.threadId !== undefined && d.threadId !== null) {
    const thread = (
      await db.execute(sql`
        SELECT 1 FROM email_threads WHERE id = ${d.threadId} AND account_id = ${d.accountId}
      `)
    ).rows[0];
    if (thread === undefined)
      return err(
        new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found for account", {}),
      );
  }
  const to = JSON.stringify(d.toEmails);
  const cc = JSON.stringify(d.ccEmails);
  const visibility = d.visibility ?? "shared";
  if (d.id !== undefined) {
    const row = (
      await db.execute(sql`
        UPDATE email_drafts
        SET subject = ${d.subject}, body_html = ${d.bodyHtml},
            to_emails = ${to}::jsonb, cc_emails = ${cc}::jsonb,
            thread_id = ${d.threadId ?? null}, visibility = ${visibility}, updated_at = now()
        WHERE id = ${d.id} AND account_id = ${d.accountId}
        RETURNING id
      `)
    ).rows[0] as { id: string } | undefined;
    if (row === undefined)
      return err(new AppError(ERROR_IDS.GMAIL_DRAFT_NOT_FOUND, "draft not found", {}));
    return ok({ id: row.id });
  }
  const inserted = (
    await db.execute(sql`
      INSERT INTO email_drafts (account_id, thread_id, subject, body_html, to_emails, cc_emails, visibility)
      VALUES (${d.accountId}, ${d.threadId ?? null}, ${d.subject}, ${d.bodyHtml}, ${to}::jsonb, ${cc}::jsonb, ${visibility})
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (inserted === undefined)
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "draft insert returned no row", {}));
  return ok({ id: inserted.id });
}

interface DraftRow {
  id: string;
  subject: string | null;
  body_html: string | null;
  to_emails: unknown;
  cc_emails: unknown;
  thread_id: string | null;
  account_id: string;
  visibility: EmailVisibility;
  updated_at: string;
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

export async function listDrafts(
  db: Db,
  actor: AuthUser,
  signal: AbortSignal,
): Promise<DraftSummary[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT d.id, d.subject, d.body_html, d.to_emails, d.cc_emails, d.thread_id, d.account_id,
             d.visibility, d.updated_at
      FROM email_drafts d JOIN email_accounts a ON a.id = d.account_id
      WHERE a.user_id = ${actor.id}
      ORDER BY d.updated_at DESC
    `)
  ).rows as unknown as DraftRow[];
  signal.throwIfAborted();
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    bodyHtml: r.body_html,
    toEmails: asStrings(r.to_emails),
    ccEmails: asStrings(r.cc_emails),
    threadId: r.thread_id,
    accountId: r.account_id,
    visibility: r.visibility,
    updatedAt: r.updated_at,
  }));
}

// Delete only a draft the actor owns (mailbox owner). Missing and not-owned both return
// E_GMAIL_014 so a caller cannot probe which draft ids exist.
export async function deleteDraft(
  db: Db,
  args: { actor: AuthUser; draftId: string },
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      DELETE FROM email_drafts d
      USING email_accounts a
      WHERE d.account_id = a.id AND d.id = ${args.draftId} AND a.user_id = ${args.actor.id}
      RETURNING d.id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined)
    return err(new AppError(ERROR_IDS.GMAIL_DRAFT_NOT_FOUND, "draft not found", {}));
  return ok({ id: row.id });
}
