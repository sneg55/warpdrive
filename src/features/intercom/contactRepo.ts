import { and, asc, gte, inArray, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import { intercomContacts } from "@/db/schema";
import { chunks, uniqueBy } from "./batch";

type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface ContactRow {
  id: string;
  email: string | null;
  role: string | null;
  gone?: boolean;
}

export async function freshContactIds(
  db: Db,
  ids: string[],
  since: Date,
  signal: AbortSignal,
): Promise<Set<string>> {
  signal.throwIfAborted();
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: intercomContacts.id })
    .from(intercomContacts)
    .where(and(inArray(intercomContacts.id, ids), gte(intercomContacts.updatedAt, since)));
  return new Set(rows.map((r) => r.id));
}

export async function staleContactIds(
  db: Db,
  before: Date,
  limit: number,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const rows = await db
    .select({ id: intercomContacts.id })
    .from(intercomContacts)
    .where(lt(intercomContacts.updatedAt, before))
    .orderBy(asc(intercomContacts.updatedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

export async function upsertContacts(
  db: Db | Tx,
  contacts: ContactRow[],
  fetchedAt: Date,
): Promise<void> {
  const unique = uniqueBy(contacts, (c) => c.id);
  for (const batch of chunks(unique.filter((c) => c.gone !== true))) {
    await db
      .insert(intercomContacts)
      .values(batch.map((c) => ({ id: c.id, email: c.email, role: c.role, updatedAt: fetchedAt })))
      .onConflictDoUpdate({
        target: intercomContacts.id,
        set: {
          email: sql`excluded.email`,
          role: sql`excluded.role`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  for (const batch of chunks(unique.filter((c) => c.gone === true))) {
    await db
      .insert(intercomContacts)
      .values(batch.map((c) => ({ id: c.id, email: null, role: null, updatedAt: fetchedAt })))
      .onConflictDoUpdate({
        target: intercomContacts.id,
        set: { updatedAt: sql`excluded.updated_at` },
      });
  }
}
