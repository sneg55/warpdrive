import { type SQL, sql } from "drizzle-orm";
import { NOREPLY_LOCAL_PARTS } from "@/constants/intercom";

function noreplyArray(): SQL {
  return sql`ARRAY[${sql.join(
    NOREPLY_LOCAL_PARTS.map((p) => sql`${p}`),
    sql`, `,
  )}]::text[]`;
}

export function matchableEmailSql(column: SQL): SQL {
  return sql`(${column} IS NOT NULL AND ${column} LIKE '%@%' AND split_part(${column}, '@', 1) <> ALL(${noreplyArray()}))`;
}

export function personEmailsCte(personIds: string[]): SQL {
  const ids = sql`ARRAY[${sql.join(
    personIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
  return sql`
    person_emails AS (
      SELECT DISTINCT v.email
      FROM persons p
      CROSS JOIN LATERAL (
        SELECT lower(btrim(p.primary_email::text)) AS email
        UNION ALL
        SELECT lower(btrim(x->>'value'))
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p.emails) = 'array' THEN p.emails ELSE '[]'::jsonb END
        ) x
      ) v
      WHERE p.id = ANY(${ids}) AND p.deleted_at IS NULL AND ${matchableEmailSql(sql`v.email`)}
    )`;
}

export function conversationMatchesPersonEmails(conversationId: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM intercom_conversation_contacts l
      JOIN intercom_contacts ic ON ic.id = l.contact_id
      JOIN person_emails pe ON pe.email = ic.email
    WHERE l.conversation_id = ${conversationId}
  )`;
}
