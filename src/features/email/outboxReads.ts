import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { outboxAuthorPredicate } from "./authorPredicates";

export interface OutboxItem {
  id: string;
  subject: string | null;
  to: string[];
  status: string;
  scheduledAt: string | null;
  errorId: string | null;
  createdAt: string;
}

interface OutboxRow {
  id: string;
  subject: string | null;
  to_emails: unknown;
  status: string;
  scheduled_at: string | null;
  error_id: string | null;
  created_at: string;
}

export async function listOutbox(
  db: Db,
  actor: AuthUser,
  signal: AbortSignal,
): Promise<OutboxItem[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT s.id,
             s.payload ->> 'subject' AS subject,
             COALESCE(s.payload -> 'to', '[]'::jsonb) AS to_emails,
             s.status, s.scheduled_at, s.error_id, s.created_at
      FROM email_send_attempts s JOIN email_accounts a ON a.id = s.account_id
      WHERE ${outboxAuthorPredicate(actor.id)}
        AND (
          s.status IN ('pending', 'sending', 'needs_review')
          OR (s.scheduled_at IS NOT NULL AND s.scheduled_at > now())
        )
        AND s.status <> 'sent'
      ORDER BY s.created_at DESC
    `)
  ).rows as unknown as OutboxRow[];
  signal.throwIfAborted();
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    to: Array.isArray(r.to_emails) ? (r.to_emails as string[]) : [],
    status: r.status,
    scheduledAt: r.scheduled_at,
    errorId: r.error_id,
    createdAt: r.created_at,
  }));
}
