import { type SQL, sql } from "drizzle-orm";
import type { SearchSection } from "@/constants/search";
import {
  SEARCH_PER_SECTION,
  SEARCH_SNIPPET_CHARS,
  type SearchMatchSource,
} from "@/constants/search";
import type { Db } from "@/db/client";
import { buildUuidArray, type VisibilityCtx } from "@/features/permissions/sql";
import type { SearchResult } from "@/types/search";
import { contentSourcesFor } from "./contentSources";
import { fieldMatchSql } from "./fieldMatch";
import type { SearchPattern } from "./pattern";
import { SECTION_DEFS } from "./sections";
import { buildSnippet } from "./snippet";

interface FieldRow {
  id: string;
  primary: string;
  secondary: string | null;
}

interface ContentRow extends FieldRow {
  source: SearchMatchSource;
  label: string;
  matched_text: string;
}

function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

export interface SectionQuery {
  db: Db;
  section: SearchSection;
  ctx: VisibilityCtx;
  pattern: SearchPattern;
  rawQuery: string;
  signal: AbortSignal;
}

async function fieldHits(q: SectionQuery): Promise<SearchResult[]> {
  const def = SECTION_DEFS[q.section];
  const result = await q.db.execute(sql`
    SELECT r.id, ${def.primary} AS primary, ${def.secondary} AS secondary
    FROM ${def.from}
    WHERE ${def.base} AND ${fieldMatchSql(q.section, q.pattern, q.rawQuery)}
      AND ${def.visibility(q.ctx)}
    ORDER BY (lower(${def.primary}) LIKE ${q.pattern.prefix}) DESC, ${def.primary} ASC, r.id
    LIMIT ${SEARCH_PER_SECTION}
  `);
  q.signal.throwIfAborted();
  return rowsOf<FieldRow>(result).map((r) => ({ ...r, match: null }));
}

function unionOfSources(q: SectionQuery): SQL | null {
  const parts = contentSourcesFor(q.section)
    .map((source) => source({ section: q.section, pattern: q.pattern, ctx: q.ctx }))
    .filter((part): part is SQL => part !== null);
  return parts.length === 0 ? null : sql.join(parts, sql` UNION ALL `);
}

async function contentHits(
  q: SectionQuery,
  excludeIds: string[],
  limit: number,
): Promise<SearchResult[]> {
  const union = unionOfSources(q);
  if (union === null) return [];
  const def = SECTION_DEFS[q.section];
  const result = await q.db.execute(sql`
    WITH hits AS (${union})
    SELECT * FROM (
      SELECT DISTINCT ON (r.id) r.id, ${def.primary} AS primary, ${def.secondary} AS secondary,
             h.source, h.label, h.matched_text, h.matched_at
      FROM ${def.from}
      JOIN hits h ON h.record_id = r.id
      WHERE ${def.base} AND ${def.visibility(q.ctx)}
        AND NOT (r.id = ANY(${buildUuidArray(excludeIds)}))
      ORDER BY r.id, h.matched_at DESC NULLS LAST
    ) best
    ORDER BY best.matched_at DESC NULLS LAST, best.id
    LIMIT ${limit}
  `);
  q.signal.throwIfAborted();
  return rowsOf<ContentRow>(result).map((r) => ({
    id: r.id,
    primary: r.primary,
    secondary: r.secondary,
    match: {
      source: r.source,
      label: r.label,
      snippet: buildSnippet(r.matched_text, q.pattern.terms[0]?.lower ?? "", SEARCH_SNIPPET_CHARS),
    },
  }));
}

export async function searchSection(q: SectionQuery): Promise<SearchResult[]> {
  const fields = await fieldHits(q);
  const remaining = SEARCH_PER_SECTION - fields.length;
  if (!q.pattern.searchContent || remaining <= 0) return fields;
  const content = await contentHits(
    q,
    fields.map((f) => f.id),
    remaining,
  );
  return [...fields, ...content];
}
