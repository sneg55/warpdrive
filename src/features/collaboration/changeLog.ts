import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { changeLogs, users } from "@/db/schema";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import type { EntityType } from "@/types/entityRef";

export type ChangeLogEntry = {
  id: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
  // Actor display name resolved via the users join; null when the actor is
  // unknown (system-originated row or a since-deleted user).
  actorName: string | null;
  createdAt: Date;
};

export type RecordChangeArgs = {
  entityType: EntityType;
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
};

// Append-only insert into the change_logs audit trail. Takes DbOrTx so callers
// can record the change inside their own mutation transaction (atomic with the
// write that produced it).
export async function recordChange(
  db: DbOrTx,
  args: RecordChangeArgs,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  // Raw sql via .execute(): Drizzle's query-builder methods (.insert) do not type
  // -resolve over the Db | Tx union, so the codebase uses sql() for DbOrTx writes
  // (mirrors notify.ts / channelVersions.ts). JSON values are stringified for jsonb.
  const oldJson = JSON.stringify(args.oldValue ?? null);
  const newJson = JSON.stringify(args.newValue ?? null);
  await db.execute(sql`
    INSERT INTO ${changeLogs}
      (entity_type, entity_id, field, old_value, new_value, actor_id)
    VALUES (
      ${args.entityType}, ${args.entityId}::uuid, ${args.field},
      ${oldJson}::jsonb, ${newJson}::jsonb, ${args.actorId}
    )
  `);
}

// Parse a jsonb column read as ::text back into its JS value exactly once.
// node-postgres's built-in type parser already JSON.parses jsonb columns (OID
// 3802), so selecting a jsonb column through drizzle's typed query builder feeds
// an already-decoded value into PgJsonb.mapFromDriverValue, which re-parses any
// string it sees. That double-decode corrupts jsonb-stored STRINGS that are
// themselves valid JSON literals: a deal value of "2000.00" (jsonb string) comes
// back as the number 2000, silently dropping precision. Selecting the column
// cast to text sidesteps drizzle's column mapper entirely so we control the
// single JSON.parse ourselves.
function parseJsonbText(text: string | null): unknown {
  if (text === null) return null;
  return JSON.parse(text);
}

// Newest-first history for an entity. Visibility note: this does NOT gate the
// parent; change logs inherit parent visibility and the CALLER must gate the
// parent before exposing the log.
export async function listChangeLog(
  db: Db,
  entityType: EntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<ChangeLogEntry[]> {
  signal.throwIfAborted();
  // Left join users so an actor that was since deleted (or a null actor) still
  // yields the row with actorName null, rather than dropping it.
  const rows = await db
    .select({
      id: changeLogs.id,
      field: changeLogs.field,
      oldValue: sql<string | null>`${changeLogs.oldValue}::text`,
      newValue: sql<string | null>`${changeLogs.newValue}::text`,
      actorId: changeLogs.actorId,
      actorName: users.name,
      createdAt: changeLogs.createdAt,
    })
    .from(changeLogs)
    .leftJoin(users, eq(users.id, changeLogs.actorId))
    .where(and(eq(changeLogs.entityType, entityType), eq(changeLogs.entityId, entityId)))
    .orderBy(desc(changeLogs.createdAt));
  return rows.map((r) => ({
    id: r.id,
    field: r.field,
    oldValue: parseJsonbText(r.oldValue),
    newValue: parseJsonbText(r.newValue),
    actorId: r.actorId,
    actorName: r.actorName ?? null,
    createdAt: r.createdAt,
  }));
}
