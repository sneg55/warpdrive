import { type SQL, sql } from "drizzle-orm";

export function labelMembershipSql(colSql: SQL, value: string | number | string[]): SQL {
  if (Array.isArray(value)) {
    return sql`EXISTS (SELECT 1 FROM unnest(${colSql}) AS t(v) WHERE lower(t.v) = ANY(SELECT lower(x) FROM unnest(${sql.param(value)}::text[]) AS x))`;
  }
  return sql`EXISTS (SELECT 1 FROM unnest(${colSql}) AS t(v) WHERE lower(t.v) = lower(${String(value)}))`;
}
