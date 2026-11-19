import { sql } from "drizzle-orm";
import { INTERCOM_DEAL_SEARCH_REFRESH_CHUNK } from "@/constants/intercom";
import { INTERCOM_TITLE_PART_ID } from "@/constants/search";
import type { Db } from "@/db/client";
import { personEmailPairsSql } from "../personMatch";

function uuidArray(ids: string[]) {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
}

function dealPersonsSql(ids: ReturnType<typeof uuidArray>) {
  return sql`
    SELECT d.id AS deal_id, d.person_id FROM deals d
    WHERE d.id = ANY(${ids}) AND d.deleted_at IS NULL AND d.person_id IS NOT NULL
    UNION
    SELECT dp.deal_id, dp.person_id FROM deal_participants dp
    JOIN deals d ON d.id = dp.deal_id
    WHERE d.id = ANY(${ids}) AND d.deleted_at IS NULL`;
}

function insertCurrentRowsSql(ids: ReturnType<typeof uuidArray>) {
  return sql`
    INSERT INTO deal_intercom_search
      (deal_id, person_id, contact_id, conversation_id, part_id, plain_text, matched_at)
    WITH deal_persons AS (${dealPersonsSql(ids)}),
    person_emails AS (
      ${personEmailPairsSql(sql`SELECT person_id FROM deal_persons`)}
    ),
    links AS (
      SELECT DISTINCT dp.deal_id, dp.person_id, ic.id AS contact_id, l.conversation_id
      FROM deal_persons dp
      JOIN person_emails pe ON pe.person_id = dp.person_id
      JOIN intercom_contacts ic ON ic.email = pe.email
      JOIN intercom_conversation_contacts l ON l.contact_id = ic.id
      JOIN intercom_conversations c ON c.id = l.conversation_id AND c.message_count > 0
    )
    SELECT k.deal_id, k.person_id, k.contact_id, k.conversation_id, cp.id,
           search_plain_text(cp.body_html), cp.created_at
    FROM links k
    JOIN intercom_conversation_parts cp ON cp.conversation_id = k.conversation_id
    WHERE search_plain_text(cp.body_html) <> ''
    UNION ALL
    SELECT k.deal_id, k.person_id, k.contact_id, k.conversation_id, ${INTERCOM_TITLE_PART_ID}::text,
           search_plain_text(c.title), c.last_part_at
    FROM links k
    JOIN intercom_conversations c ON c.id = k.conversation_id
    WHERE search_plain_text(c.title) <> ''
    ON CONFLICT DO NOTHING`;
}

export async function refreshDealIntercomSearch(
  db: Db,
  dealIds: string[],
  signal: AbortSignal,
): Promise<void> {
  for (let i = 0; i < dealIds.length; i += INTERCOM_DEAL_SEARCH_REFRESH_CHUNK) {
    const batch = dealIds.slice(i, i + INTERCOM_DEAL_SEARCH_REFRESH_CHUNK);
    signal.throwIfAborted();
    const ids = uuidArray(batch);
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM deal_intercom_search WHERE deal_id = ANY(${ids})`);
      signal.throwIfAborted();
      await tx.execute(insertCurrentRowsSql(ids));
      signal.throwIfAborted();
    });
  }
}
