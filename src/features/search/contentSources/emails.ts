import { type SQL, sql } from "drizzle-orm";
import { SEARCH_SOURCE_LABELS } from "@/constants/search";
import { assertNever } from "@/types/result";
import { emailVisibilitySql } from "../emailVisibilitySql";
import { matchesEveryTerm } from "../pattern";
import { recordVisibility } from "../visibilitySql";
import type { ContentSource, SourceContext } from "./types";

interface EmailLink {
  recordId: SQL;
  join: SQL;
  where: SQL;
}

function linkFor({ section, ctx }: SourceContext): EmailLink {
  switch (section) {
    case "deal":
      return { recordId: sql`t.deal_id`, join: sql``, where: sql`t.deal_id IS NOT NULL` };
    case "person":
      return { recordId: sql`t.person_id`, join: sql``, where: sql`t.person_id IS NOT NULL` };
    case "lead":
      return { recordId: sql`t.lead_id`, join: sql``, where: sql`t.lead_id IS NOT NULL` };
    case "organization":
      return {
        recordId: sql`pe.org_id`,
        join: sql`JOIN persons pe ON pe.id = t.person_id`,
        where: sql`pe.org_id IS NOT NULL AND pe.deleted_at IS NULL AND ${recordVisibility(ctx, "pe")}`,
      };
    default:
      return assertNever(section);
  }
}

const MESSAGE_COLUMNS: SQL[] = [
  sql`m.subject`,
  sql`m.body_text`,
  sql`m.body_html_plain`,
  sql`m.from_name`,
  sql`m.from_email::text`,
];

export const emailsSource: ContentSource = (c) => {
  const link = linkFor(c);
  const visible = emailVisibilitySql(c.ctx);
  const head = (text: SQL, when: SQL, messageJoin: SQL) => sql`
    SELECT ${link.recordId} AS record_id, 'email' AS source, ${SEARCH_SOURCE_LABELS.email}::text AS label,
           ${text} AS matched_text, ${when} AS matched_at
    FROM email_threads t
    ${messageJoin}
    JOIN email_accounts a ON a.id = t.account_id
    ${link.join}`;
  const tail = (predicate: SQL) => sql`
    WHERE t.trashed_at IS NULL AND ${link.where} AND ${predicate} AND ${visible}`;

  const threadBranch = sql`${head(sql`t.subject`, sql`coalesce(t.last_message_at, t.created_at)`, sql``)}
    ${tail(matchesEveryTerm(sql`t.subject`, c.pattern))}`;
  const messageBranches = MESSAGE_COLUMNS.map(
    (
      col,
    ) => sql`${head(col, sql`coalesce(m.sent_at, m.created_at)`, sql`JOIN email_messages m ON m.thread_id = t.id`)}
    ${tail(matchesEveryTerm(col, c.pattern))}`,
  );
  return sql.join([threadBranch, ...messageBranches], sql` UNION ALL `);
};
