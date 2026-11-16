import { and, asc, isNull, or, sql } from "drizzle-orm";
import { RECIPIENT_SEARCH_LIMIT, RECIPIENT_SEARCH_SCAN } from "@/constants/email";
import type { Db } from "@/db/client";
import type { Person } from "@/db/schema";
import { persons } from "@/db/schema";
import { canSee } from "@/features/permissions/canSee";
import { type ContactActor, toVisibleRecord } from "./personsRepo";

export interface RecipientOption {
  personId: string;
  name: string;
  email: string;
}

const escapeLike = (query: string): string => query.replace(/[\\%_]/g, (c) => `\\${c}`);

function addressesOf(primary: string | null, points: Array<{ value: string }>): string[] {
  const all = primary === null ? [] : [primary];
  for (const p of points) all.push(p.value);
  return [...new Set(all.map((v) => v.trim()).filter((v) => v !== ""))];
}

function optionsFor(row: Person, needle: string, skip: Set<string>): RecipientOption[] {
  const nameMatches = row.name.toLowerCase().includes(needle);
  return addressesOf(row.primaryEmail, row.emails)
    .filter((email) => {
      const lower = email.toLowerCase();
      return !skip.has(lower) && (nameMatches || lower.includes(needle));
    })
    .map((email) => ({ personId: row.id, name: row.name, email }));
}

function matchCondition(pattern: string) {
  return and(
    isNull(persons.deletedAt),
    or(
      sql`${persons.name} ILIKE ${pattern}`,
      sql`${persons.primaryEmail} ILIKE ${pattern}`,
      sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${persons.emails}) e WHERE e->>'value' ILIKE ${pattern})`,
    ),
  );
}

export async function searchRecipients(
  db: Db,
  actor: ContactActor,
  query: string,
  signal: AbortSignal,
  exclude: string[] = [],
): Promise<RecipientOption[]> {
  signal.throwIfAborted();
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const escaped = escapeLike(needle);
  const rank = sql`CASE WHEN ${persons.name} ILIKE ${`${escaped}%`} THEN 0 WHEN ${persons.name} ILIKE ${`% ${escaped}%`} THEN 1 ELSE 2 END`;
  const skip = new Set(exclude.map((e) => e.trim().toLowerCase()));
  const options: RecipientOption[] = [];
  for (let offset = 0; ; offset += RECIPIENT_SEARCH_SCAN) {
    const rows = await db
      .select()
      .from(persons)
      .where(matchCondition(`%${escaped}%`))
      .orderBy(rank, asc(persons.name), asc(persons.id))
      .limit(RECIPIENT_SEARCH_SCAN)
      .offset(offset);
    signal.throwIfAborted();
    const visible = rows.filter((row) => canSee(actor, toVisibleRecord(row)));
    options.push(...visible.flatMap((row) => optionsFor(row, needle, skip)));
    if (options.length >= RECIPIENT_SEARCH_LIMIT) return options.slice(0, RECIPIENT_SEARCH_LIMIT);
    if (rows.length < RECIPIENT_SEARCH_SCAN) return options;
  }
}
