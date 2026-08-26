// One membership fragment for every entity whose labels live in a text[] column (deals, people,
// orgs, leads), so the four filter compilers cannot drift on case handling or on binding.
import { type SQL, sql } from "drizzle-orm";

// "carries this label", or with a list, "carries any of these labels". Case-insensitive on both
// sides because 0046_label_backfill leaves legacy lowercase values in the array while the picker
// offers the catalog's cased name. The names stay bound: a single value binds as $n, a list binds
// as one text[] parameter rather than an expanded tuple.
export function labelMembershipSql(colSql: SQL, value: string | number | string[]): SQL {
  if (Array.isArray(value)) {
    return sql`EXISTS (SELECT 1 FROM unnest(${colSql}) AS t(v) WHERE lower(t.v) = ANY(SELECT lower(x) FROM unnest(${sql.param(value)}::text[]) AS x))`;
  }
  return sql`EXISTS (SELECT 1 FROM unnest(${colSql}) AS t(v) WHERE lower(t.v) = lower(${String(value)}))`;
}
