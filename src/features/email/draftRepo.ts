import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { draftAuthorPredicate } from "./authorPredicates";
import { assertDraftLinks } from "./draftLinks";
import { DRAFT_COLUMNS, type DraftRow, type DraftSummary, toDraftSummary } from "./draftRow";
import { assertMailboxOwner } from "./mailboxOwnership";
import type { EmailVisibility } from "./threadVisibility";

export type { DraftSummary } from "./draftRow";

export interface DraftInput {
  id?: string;
  accountId: string;
  threadId?: string | null;
  subject: string;
  bodyHtml: string;
  toEmails: string[];
  ccEmails: string[];
  visibility?: EmailVisibility;
  linkDealId?: string | null;
  linkPersonId?: string | null;
}

export async function saveDraft(
  db: Db,
  args: { actor: AuthUser; draft: DraftInput },
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();
  const d = args.draft;
  const allowed = await assertMailboxOwner(db, d.accountId, args.actor.id, signal);
  if (!allowed.ok) return allowed;
  if (d.threadId !== undefined && d.threadId !== null) {
    const thread = (
      await db.execute(sql`
        SELECT 1 FROM email_threads WHERE id = ${d.threadId} AND account_id = ${d.accountId}
      `)
    ).rows[0];
    signal.throwIfAborted();
    if (thread === undefined)
      return err(
        new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found for account", {}),
      );
  }
  const links = await assertDraftLinks(db, d, signal);
  if (!links.ok) return links;
  const to = JSON.stringify(d.toEmails);
  const cc = JSON.stringify(d.ccEmails);
  const visibility = d.visibility ?? "shared";
  const dealId = d.linkDealId ?? null;
  const personId = d.linkPersonId ?? null;
  if (d.id !== undefined) {
    const row = (
      await db.execute(sql`
        UPDATE email_drafts d
        SET author_user_id = ${args.actor.id}, account_id = ${d.accountId}, subject = ${d.subject}, body_html = ${d.bodyHtml},
            to_emails = ${to}::jsonb, cc_emails = ${cc}::jsonb,
            thread_id = ${d.threadId ?? null}, visibility = ${visibility},
            link_deal_id = ${dealId}, link_person_id = ${personId}, updated_at = now()
        FROM email_accounts a
        WHERE d.id = ${d.id} AND a.id=d.account_id AND ${draftAuthorPredicate(args.actor.id)}
        RETURNING d.id
      `)
    ).rows[0] as { id: string } | undefined;
    signal.throwIfAborted();
    if (row === undefined)
      return err(new AppError(ERROR_IDS.GMAIL_DRAFT_NOT_FOUND, "draft not found", {}));
    return ok({ id: row.id });
  }
  const inserted = (
    await db.execute(sql`
      INSERT INTO email_drafts (author_user_id, account_id, thread_id, subject, body_html, to_emails, cc_emails,
        visibility, link_deal_id, link_person_id)
      VALUES (${args.actor.id}, ${d.accountId}, ${d.threadId ?? null}, ${d.subject}, ${d.bodyHtml}, ${to}::jsonb,
        ${cc}::jsonb, ${visibility}, ${dealId}, ${personId})
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  signal.throwIfAborted();
  if (inserted === undefined)
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "draft insert returned no row", {}));
  return ok({ id: inserted.id });
}

export async function listDrafts(
  db: Db,
  actor: AuthUser,
  signal: AbortSignal,
): Promise<DraftSummary[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT ${sql.raw(DRAFT_COLUMNS)}
      FROM email_drafts d JOIN email_accounts a ON a.id = d.account_id
      WHERE ${draftAuthorPredicate(actor.id)}
      ORDER BY d.updated_at DESC
    `)
  ).rows as unknown as DraftRow[];
  signal.throwIfAborted();
  return rows.map(toDraftSummary);
}

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
      WHERE d.account_id = a.id AND d.id = ${args.draftId} AND ${draftAuthorPredicate(args.actor.id)}
      RETURNING d.id
    `)
  ).rows[0] as { id: string } | undefined;
  signal.throwIfAborted();
  if (row === undefined)
    return err(new AppError(ERROR_IDS.GMAIL_DRAFT_NOT_FOUND, "draft not found", {}));
  return ok({ id: row.id });
}

export interface DraftPatch {
  subject?: string;
  bodyHtml?: string;
  toEmails?: string[];
  ccEmails?: string[];
}

export async function patchDraft(
  db: Db,
  args: { actor: AuthUser; draftId: string; patch: DraftPatch },
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();
  const p = args.patch;
  const sets = [sql`updated_at = now()`];
  if (p.subject !== undefined) sets.push(sql`subject = ${p.subject}`);
  if (p.bodyHtml !== undefined) sets.push(sql`body_html = ${p.bodyHtml}`);
  if (p.toEmails !== undefined) sets.push(sql`to_emails = ${JSON.stringify(p.toEmails)}::jsonb`);
  if (p.ccEmails !== undefined) sets.push(sql`cc_emails = ${JSON.stringify(p.ccEmails)}::jsonb`);
  const row = (
    await db.execute(sql`
      UPDATE email_drafts d
      SET ${sql.join(sets, sql`, `)}
      FROM email_accounts a
      WHERE d.account_id = a.id AND d.id = ${args.draftId} AND ${draftAuthorPredicate(args.actor.id)}
      RETURNING d.id
    `)
  ).rows[0] as { id: string } | undefined;
  signal.throwIfAborted();
  if (row === undefined)
    return err(new AppError(ERROR_IDS.GMAIL_DRAFT_NOT_FOUND, "draft not found", {}));
  return ok({ id: row.id });
}
