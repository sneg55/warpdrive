import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { personEmailPairsSql } from "@/features/intercom/personMatch";

function qualifyingEmailsCte(): SQL {
  return sql`
    linked AS (
      SELECT d.person_id FROM deals d WHERE d.deleted_at IS NULL AND d.person_id IS NOT NULL
      UNION
      SELECT dp.person_id FROM deal_participants dp
        JOIN deals d ON d.id = dp.deal_id WHERE d.deleted_at IS NULL
    ),
    qualifying AS (
      SELECT DISTINCT pairs.email FROM (${personEmailPairsSql(sql`SELECT person_id FROM linked`)}) pairs
    )`;
}

export async function trackEmails(db: Db, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      WITH ${qualifyingEmailsCte()}
      INSERT INTO brevo_tracked_emails (email)
      SELECT email FROM qualifying
      ON CONFLICT (email) DO UPDATE SET active = true WHERE brevo_tracked_emails.active = false`);
    await tx.execute(sql`
      WITH ${qualifyingEmailsCte()}
      UPDATE brevo_tracked_emails SET active = false
      WHERE active AND email NOT IN (SELECT email FROM qualifying)`);
  });
  signal.throwIfAborted();
}
