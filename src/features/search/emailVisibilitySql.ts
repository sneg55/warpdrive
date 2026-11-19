import { type SQL, sql } from "drizzle-orm";
import { mailboxAccessPredicate } from "@/features/email/mailboxAccess";
import type { VisibilityCtx } from "@/features/permissions/sql";
import { visibleDealExists, visiblePersonExists } from "./visibilitySql";

export function emailVisibilitySql(ctx: VisibilityCtx): SQL {
  const sharedMailbox = sql`(a.user_id IS NULL AND ${mailboxAccessPredicate(ctx.userId)})`;
  const linkedRecordVisible = sql`(
    t.visibility <> 'private' AND (
      (t.deal_id IS NOT NULL AND ${visibleDealExists(ctx, sql`t.deal_id`)})
      OR (t.person_id IS NOT NULL AND ${visiblePersonExists(ctx, sql`t.person_id`)})
    )
  )`;
  return sql`(a.user_id = ${ctx.userId} OR ${sharedMailbox} OR ${linkedRecordVisible})`;
}
