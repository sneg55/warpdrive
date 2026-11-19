import { type SQL, sql } from "drizzle-orm";
import { SEARCH_SOURCE_LABELS, type SearchSection } from "@/constants/search";
import { assertNever } from "@/types/result";
import { activityVisibilitySql } from "../activityVisibilitySql";
import { matchesEveryTerm } from "../pattern";
import type { ContentSource } from "./types";

export function activityParentColumn(section: SearchSection): SQL {
  switch (section) {
    case "deal":
      return sql`a.deal_id`;
    case "person":
      return sql`a.person_id`;
    case "lead":
      return sql`a.lead_id`;
    case "organization":
      return sql`a.org_id`;
    default:
      return assertNever(section);
  }
}

export const activitiesSource: ContentSource = ({ section, pattern, ctx }) => {
  const parent = activityParentColumn(section);
  const visible = activityVisibilitySql(ctx);
  const when = sql`coalesce(a.done_at, a.due_at, a.created_at)`;
  const branch = (text: SQL, predicate: SQL) => sql`
    SELECT ${parent} AS record_id, 'activity' AS source, ${SEARCH_SOURCE_LABELS.activity}::text AS label,
           ${text} AS matched_text, ${when} AS matched_at
    FROM activities a
    WHERE ${parent} IS NOT NULL AND a.deleted_at IS NULL AND ${predicate} AND ${visible}`;
  return sql`${branch(sql`a.subject`, matchesEveryTerm(sql`a.subject`, pattern))}
    UNION ALL ${branch(
      sql`search_plain_text(a.note)`,
      matchesEveryTerm(sql`search_plain_text(a.note)`, pattern),
    )}`;
};
