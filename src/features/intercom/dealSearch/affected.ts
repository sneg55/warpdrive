import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { matchableEmailSql, personEmailPairsSql } from "../personMatch";

type Ids = string[];

function textArray(ids: Ids) {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[]`;
}

function uuidArray(ids: Ids) {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
}

const DEALS_OF_PERSONS = sql`
  SELECT d.id AS deal_id FROM deals d
  WHERE d.deleted_at IS NULL AND d.person_id IN (SELECT person_id FROM affected_persons)
  UNION
  SELECT dp.deal_id FROM deal_participants dp
  JOIN deals d ON d.id = dp.deal_id AND d.deleted_at IS NULL
  WHERE dp.person_id IN (SELECT person_id FROM affected_persons)`;

const PERSONS_WITH_EMAILS = sql`
  SELECT p.id AS person_id FROM persons p
  WHERE p.deleted_at IS NULL AND (
    lower(btrim(p.primary_email::text)) IN (SELECT email FROM contact_emails)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.emails) = 'array' THEN p.emails ELSE '[]'::jsonb END
      ) x
      WHERE lower(btrim(x->>'value')) IN (SELECT email FROM contact_emails)
    )
  )`;

async function dealIds(
  db: DbOrTx,
  query: ReturnType<typeof sql>,
  signal: AbortSignal,
): Promise<Ids> {
  const rows = (await db.execute(query)).rows as Array<{ deal_id: string }>;
  signal.throwIfAborted();
  return rows.map((r) => r.deal_id);
}

export async function dealsForConversations(
  db: DbOrTx,
  conversationIds: Ids,
  signal: AbortSignal,
): Promise<Ids> {
  if (conversationIds.length === 0) return [];
  return dealIds(
    db,
    sql`
    WITH contact_emails AS (
      SELECT DISTINCT ic.email FROM intercom_conversation_contacts l
      JOIN intercom_contacts ic ON ic.id = l.contact_id
      WHERE l.conversation_id = ANY(${textArray(conversationIds)}) AND ${matchableEmailSql(sql`ic.email`)}
    ),
    affected_persons AS (${PERSONS_WITH_EMAILS})
    ${DEALS_OF_PERSONS}`,
    signal,
  );
}

export async function dealsForContacts(
  db: DbOrTx,
  contactIds: Ids,
  signal: AbortSignal,
): Promise<Ids> {
  if (contactIds.length === 0) return [];
  return dealIds(
    db,
    sql`
    WITH contact_emails AS (
      SELECT DISTINCT ic.email FROM intercom_contacts ic
      WHERE ic.id = ANY(${textArray(contactIds)}) AND ${matchableEmailSql(sql`ic.email`)}
    ),
    affected_persons AS (${PERSONS_WITH_EMAILS})
    ${DEALS_OF_PERSONS}
    UNION
    SELECT s.deal_id FROM deal_intercom_search s WHERE s.contact_id = ANY(${textArray(contactIds)})`,
    signal,
  );
}

export async function dealsForPersons(
  db: DbOrTx,
  personIds: Ids,
  signal: AbortSignal,
): Promise<Ids> {
  if (personIds.length === 0) return [];
  return dealIds(
    db,
    sql`
    WITH affected_persons AS (SELECT unnest(${uuidArray(personIds)}) AS person_id)
    ${DEALS_OF_PERSONS}`,
    signal,
  );
}

export async function dealsWithIntercomContacts(db: DbOrTx, signal: AbortSignal): Promise<Ids> {
  return dealIds(
    db,
    sql`
    WITH deal_persons AS (
      SELECT d.id AS deal_id, d.person_id FROM deals d
      WHERE d.deleted_at IS NULL AND d.person_id IS NOT NULL
      UNION
      SELECT dp.deal_id, dp.person_id FROM deal_participants dp
      JOIN deals d ON d.id = dp.deal_id AND d.deleted_at IS NULL
    ),
    person_emails AS (${personEmailPairsSql(sql`SELECT person_id FROM deal_persons`)})
    SELECT DISTINCT dp.deal_id FROM deal_persons dp
    JOIN person_emails pe ON pe.person_id = dp.person_id
    WHERE EXISTS (SELECT 1 FROM intercom_contacts ic WHERE ic.email = pe.email)`,
    signal,
  );
}
