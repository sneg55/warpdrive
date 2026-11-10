import { sql } from "drizzle-orm";
import type { EMAIL_ACCOUNT_STATUS } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { canUseMailbox } from "./mailboxAccess";

export async function getActorMailbox(
  db: Db,
  actorId: string,
  signal: AbortSignal,
): Promise<{ id: string; emailAddress: string } | null> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`SELECT id, email_address FROM email_accounts WHERE user_id=${actorId}`)
  ).rows[0] as { id: string; email_address: string } | undefined;
  signal.throwIfAborted();
  if (row === undefined) return null;
  return { id: row.id, emailAddress: row.email_address };
}

type MailboxStatus = (typeof EMAIL_ACCOUNT_STATUS)[number];

export interface ActorMailboxStatus {
  id: string;
  emailAddress: string;
  status: MailboxStatus;
  lastSyncAt: Date | null;
  lastErrorId: string | null;
}

export async function getActorMailboxStatus(
  db: Db,
  actorId: string,
  signal: AbortSignal,
): Promise<ActorMailboxStatus | null> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      SELECT id, email_address, status, last_sync_at, last_error_id
      FROM email_accounts WHERE user_id=${actorId}
    `)
  ).rows[0] as
    | {
        id: string;
        email_address: string;
        status: MailboxStatus;
        last_sync_at: string | Date | null;
        last_error_id: string | null;
      }
    | undefined;
  if (row === undefined) return null;
  const lastSyncAt = row.last_sync_at === null ? null : new Date(row.last_sync_at);
  return {
    id: row.id,
    emailAddress: row.email_address,
    status: row.status,
    lastSyncAt,
    lastErrorId: row.last_error_id,
  };
}

export async function assertMailboxOwner(
  db: Db,
  accountId: string,
  actorId: string,
  signal: AbortSignal,
): Promise<Result<{ emailAddress: string }, AppError>> {
  signal.throwIfAborted();
  const row = (
    await db.execute(
      sql`SELECT user_id, kind, email_address FROM email_accounts WHERE id=${accountId}`,
    )
  ).rows[0] as { user_id: string | null; kind: string; email_address: string } | undefined;
  signal.throwIfAborted();
  if (row === undefined || !(await canUseMailbox(db, accountId, actorId, signal))) {
    return err(
      new AppError(
        row?.kind === "team" ? ERROR_IDS.PERM_TEAM_MAILBOX_MEMBER_REQUIRED : ERROR_IDS.PERM_DENIED,
        "not allowed to use this mailbox",
        {},
      ),
    );
  }
  return ok({ emailAddress: row.email_address });
}

export async function assertSignatureOwner(
  db: Db,
  signatureId: string,
  actorId: string,
  signal: AbortSignal,
): Promise<Result<{ bodyHtml: string }, AppError>> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`SELECT user_id, body_html FROM signatures WHERE id=${signatureId}`)
  ).rows[0] as { user_id: string; body_html: string } | undefined;
  signal.throwIfAborted();
  if (row === undefined || row.user_id !== actorId) {
    return err(
      new AppError(
        ERROR_IDS.PERM_SIGNATURE_DENIED,
        "signature not found or not owned by actor",
        {},
      ),
    );
  }
  return ok({ bodyHtml: row.body_html });
}
