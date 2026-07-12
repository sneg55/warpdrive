import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { LabelColor } from "@/constants/labelColors";
import type { Db } from "@/db/client";
import { type MailLabelRow, mailLabels } from "@/db/schema/mailLabels";
import { err, ok, type Result } from "@/types/result";

// Mail-label catalog reads/writes (inbox parity U6). Labels are inbox-personal metadata, created
// inline by any user; a thread references a row by its stable `key`. Built-in keys equal the
// historic follow-up tokens so the existing inbox label filter keeps matching (see mailLabels.ts).

// A url/token-safe key derived from the display name: lowercased, punctuation/space runs collapsed
// to a single underscore, trimmed. Two names that normalize the same share a key (that is the
// dedupe axis). Kept in sync with the built-in keys seeded by migration 0055.
export function slugifyMailLabelKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function listMailLabels(db: Db, signal: AbortSignal): Promise<MailLabelRow[]> {
  signal.throwIfAborted();
  return db.select().from(mailLabels).orderBy(asc(mailLabels.order), asc(mailLabels.name));
}

// Returns the subset of `keys` that have no matching catalog row. Case-insensitive on key to mirror
// resolveMailLabelChips (legacy tokens resolve regardless of case). Empty input or all-known returns
// []. Callers reject a thread-labels write when this is non-empty so an unknown key never persists as
// invisible, unremovable metadata (resolveMailLabelChips would silently drop it on read).
export async function findUnknownMailLabelKeys(
  db: Db,
  keys: string[],
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  if (keys.length === 0) return [];
  const rows = await db.select({ key: mailLabels.key }).from(mailLabels);
  const known = new Set(rows.map((r) => r.key.toLowerCase()));
  return keys.filter((k) => !known.has(k.toLowerCase()));
}

export async function createMailLabel(
  db: Db,
  input: { name: string; color: LabelColor },
  signal: AbortSignal,
): Promise<Result<MailLabelRow, AppError>> {
  signal.throwIfAborted();
  const name = input.name.trim();
  // Fall back to a random key when the name has no slug-able characters (e.g. all punctuation) so
  // the row is never keyed by the empty string.
  const key = slugifyMailLabelKey(name) || `label_${randomUUID().slice(0, 8)}`;

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max("order"), -1)::int` })
    .from(mailLabels);
  const nextOrder = (maxRow?.max ?? -1) + 1;

  // Find-or-create: a duplicate key resolves to the existing row (dedupe by normalized name)
  // instead of erroring. onConflictDoNothing guards a concurrent create racing on the unique key.
  const inserted = await db
    .insert(mailLabels)
    .values({ key, name, color: input.color, order: nextOrder })
    .onConflictDoNothing({ target: mailLabels.key })
    .returning();
  const created = inserted[0];
  if (created !== undefined) return ok(created);

  const [existing] = await db.select().from(mailLabels).where(eq(mailLabels.key, key));
  if (existing !== undefined) return ok(existing);
  return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "mail label insert returned no rows", {}));
}
