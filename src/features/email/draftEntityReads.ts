import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { DRAFT_COLUMNS, type DraftRow, type DraftSummary, toDraftSummary } from "./draftRow";

// Drafts linked to a record, newest first. Owner-scoped, unlike the sent messages beside them on
// the same timeline: a draft is unsent text in one person's mailbox, so only its author sees it,
// regardless of the deal's visibility or the draft's own shared/private flag (which governs the
// thread once it is sent). Deal and person differ only by the column, a fixed identifier and
// never user input, so interpolating it is safe; the linked value is bound.
async function listDraftsBy(
  db: Db,
  column: "link_deal_id" | "link_person_id",
  value: string,
  actor: AuthUser,
  signal: AbortSignal,
): Promise<DraftSummary[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT ${sql.raw(DRAFT_COLUMNS)}
      FROM email_drafts d JOIN email_accounts a ON a.id = d.account_id
      WHERE a.user_id = ${actor.id} AND d.${sql.raw(column)} = ${value}
      ORDER BY d.updated_at DESC
    `)
  ).rows as unknown as DraftRow[];
  signal.throwIfAborted();
  return rows.map(toDraftSummary);
}

export function listDraftsForDeal(
  db: Db,
  args: { actor: AuthUser; dealId: string },
  signal: AbortSignal,
): Promise<DraftSummary[]> {
  return listDraftsBy(db, "link_deal_id", args.dealId, args.actor, signal);
}

export function listDraftsForPerson(
  db: Db,
  args: { actor: AuthUser; personId: string },
  signal: AbortSignal,
): Promise<DraftSummary[]> {
  return listDraftsBy(db, "link_person_id", args.personId, args.actor, signal);
}
