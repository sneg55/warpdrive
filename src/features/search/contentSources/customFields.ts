import { type SQL, sql } from "drizzle-orm";
import type { SearchSection } from "@/constants/search";
import { assertNever } from "@/types/result";
import { activityVisibilitySql } from "../activityVisibilitySql";
import { matchesEveryTerm, type SearchPattern } from "../pattern";
import { activityParentColumn } from "./activities";
import type { ContentSource } from "./types";

function recordTable(section: SearchSection): SQL {
  switch (section) {
    case "deal":
      return sql`deals`;
    case "person":
      return sql`persons`;
    case "lead":
      return sql`leads`;
    case "organization":
      return sql`organizations`;
    default:
      return assertNever(section);
  }
}

function valueText(pattern: SearchPattern): SQL {
  return sql`(
    CASE
      WHEN def.type IN ('text', 'large_text', 'phone', 'autocomplete')
        AND jsonb_typeof(kv.value) = 'string' THEN kv.value #>> '{}'
      WHEN def.type = 'address' AND jsonb_typeof(kv.value) = 'object' THEN
        concat_ws(' ', kv.value ->> 'street', kv.value ->> 'city', kv.value ->> 'region',
                  kv.value ->> 'postal', kv.value ->> 'country')
      WHEN def.type = 'single_option' AND jsonb_typeof(kv.value) = 'string' THEN (
        SELECT string_agg(o ->> 'label', ', ')
        FROM jsonb_array_elements(def.options) o
        WHERE o ->> 'id' = kv.value #>> '{}' AND ${matchesEveryTerm(sql`(o ->> 'label')`, pattern)}
      )
      WHEN def.type = 'multi_option' AND jsonb_typeof(kv.value) = 'array' THEN (
        SELECT string_agg(o ->> 'label', ', ')
        FROM jsonb_array_elements(def.options) o
        WHERE kv.value @> to_jsonb(o ->> 'id') AND ${matchesEveryTerm(sql`(o ->> 'label')`, pattern)}
      )
    END
  )`;
}

function definitionJoin(target: string): SQL {
  return sql`JOIN custom_field_defs def
    ON def.target_entity = ${target}::custom_field_target AND def.key = kv.key
       AND def.archived_at IS NULL`;
}

export const customFieldsSource: ContentSource = ({ section, pattern }) => sql`
  SELECT r.id AS record_id, 'custom_field' AS source, def.name AS label,
         v.text AS matched_text, r.updated_at AS matched_at
  FROM ${recordTable(section)} r
  CROSS JOIN LATERAL jsonb_each(r.custom_fields) kv
  ${definitionJoin(section)}
  CROSS JOIN LATERAL (SELECT ${valueText(pattern)} AS text) v
  WHERE r.custom_fields <> '{}'::jsonb AND ${matchesEveryTerm(sql`v.text`, pattern)}`;

export const activityCustomFieldsSource: ContentSource = ({ section, pattern, ctx }) => {
  const parent = activityParentColumn(section);
  return sql`
  SELECT ${parent} AS record_id, 'custom_field' AS source, def.name AS label,
         v.text AS matched_text, coalesce(a.done_at, a.due_at, a.created_at) AS matched_at
  FROM activities a
  CROSS JOIN LATERAL jsonb_each(a.custom_fields) kv
  ${definitionJoin("activity")}
  CROSS JOIN LATERAL (SELECT ${valueText(pattern)} AS text) v
  WHERE ${parent} IS NOT NULL AND a.deleted_at IS NULL AND a.custom_fields <> '{}'::jsonb
    AND ${matchesEveryTerm(sql`v.text`, pattern)} AND ${activityVisibilitySql(ctx)}`;
};
