import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { SearchPattern } from "./pattern";

export async function resolveOptionIds(
  db: Db,
  pattern: SearchPattern,
  signal: AbortSignal,
): Promise<string[][]> {
  const columns: SQL[] = pattern.terms.map(
    (t, i) =>
      sql`coalesce(array_agg(DISTINCT o ->> 'id') FILTER (WHERE o ->> 'label' ILIKE ${t.contains}), '{}') AS ${sql.identifier(`t${i}`)}`,
  );
  const result = await db.execute(sql`
    SELECT ${sql.join(columns, sql`, `)}
    FROM custom_field_defs d
    CROSS JOIN LATERAL jsonb_array_elements(d.options) o
    WHERE d.archived_at IS NULL AND d.type IN ('single_option', 'multi_option')
  `);
  signal.throwIfAborted();
  const row = (result as { rows: Array<Record<string, string[]>> }).rows[0] ?? {};
  return pattern.terms.map((_, i) => row[`t${i}`] ?? []);
}
