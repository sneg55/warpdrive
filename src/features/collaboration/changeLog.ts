import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { changeLogs, users } from "@/db/schema";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import type { EntityType } from "@/types/entityRef";
import type { DealVisibilitySession } from "@/types/session";
import { resolveChangeLogRefNames } from "./changeLogRefNames";

export type ChangeLogEntry = {
  id: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
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

export async function recordChange(
  db: DbOrTx,
  args: RecordChangeArgs,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const oldJson = JSON.stringify(args.oldValue ?? null);
  const newJson = JSON.stringify(args.newValue ?? null);
  if (oldJson === newJson) return;
  await db.execute(sql`
    INSERT INTO ${changeLogs}
      (entity_type, entity_id, field, old_value, new_value, actor_id)
    VALUES (
      ${args.entityType}, ${args.entityId}::uuid, ${args.field},
      ${oldJson}::jsonb, ${newJson}::jsonb, ${args.actorId}
    )
  `);
}

function parseJsonbText(text: string | null): unknown {
  if (text === null) return null;
  return JSON.parse(text);
}

export async function listChangeLog(
  db: Db,
  entityType: EntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<ChangeLogEntry[]> {
  signal.throwIfAborted();
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
  const entries = rows.map((r) => ({
    id: r.id,
    field: r.field,
    oldValue: parseJsonbText(r.oldValue),
    newValue: parseJsonbText(r.newValue),
    actorId: r.actorId,
    actorName: r.actorName ?? null,
    createdAt: r.createdAt,
  }));
  return entries;
}

export async function listChangeLogForViewer(
  db: Db,
  viewer: DealVisibilitySession,
  entityType: EntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<ChangeLogEntry[]> {
  const entries = await listChangeLog(db, entityType, entityId, signal);
  return resolveChangeLogRefNames(db, viewer, entityType, entries, signal);
}
