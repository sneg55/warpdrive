import { type SQL, sql } from "drizzle-orm";
import { SEARCH_CONTENT_MIN_RUN } from "@/constants/search";

export interface SearchTerm {
  lower: string;
  contains: string;
}

export interface SearchPattern {
  lower: string;
  terms: SearchTerm[];
  prefix: string;
  searchContent: boolean;
}

const LIKE_SPECIALS = /[\\%_]/g;
const WHITESPACE = /\s+/;
const ALNUM_RUN = new RegExp(`[\\p{L}\\p{N}]{${SEARCH_CONTENT_MIN_RUN},}`, "u");

export function escapeLike(value: string): string {
  return value.replace(LIKE_SPECIALS, (c) => `\\${c}`);
}

export function buildSearchPattern(raw: string): SearchPattern {
  const lower = raw.trim().toLowerCase();
  const terms = lower
    .split(WHITESPACE)
    .filter((t) => t.length > 0)
    .map((t) => ({ lower: t, contains: `%${escapeLike(t)}%` }));
  const first = terms[0]?.lower ?? "";
  return {
    lower,
    terms,
    prefix: `${escapeLike(first)}%`,
    searchContent: terms.some((t) => ALNUM_RUN.test(t.lower)),
  };
}

export function matchesEveryTerm(text: SQL, pattern: SearchPattern): SQL {
  return sql`(${sql.join(
    pattern.terms.map((t) => sql`${text} ILIKE ${t.contains}`),
    sql` AND `,
  )})`;
}

export function matchesEveryTermInAnyOf(columns: SQL[], pattern: SearchPattern): SQL {
  return sql`(${sql.join(
    pattern.terms.map(
      (t) =>
        sql`(${sql.join(
          columns.map((c) => sql`${c} ILIKE ${t.contains}`),
          sql` OR `,
        )})`,
    ),
    sql` AND `,
  )})`;
}
