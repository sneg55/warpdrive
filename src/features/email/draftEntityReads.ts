import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { draftAuthorPredicate } from "./authorPredicates";
import { DRAFT_COLUMNS, type DraftRow, type DraftSummary, toDraftSummary } from "./draftRow";

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
      WHERE ${draftAuthorPredicate(actor.id)} AND d.${sql.raw(column)} = ${value}
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
