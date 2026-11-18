import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import {
  CHANGE_FIELD_CONVERTED_DEAL,
  CHANGE_FIELD_CONVERTED_TO_LEAD,
  CHANGE_FIELD_CREATED_FROM_DEAL,
  CHANGE_FIELD_DUPLICATED_FROM_DEAL,
  CHANGE_FIELD_MERGE,
  CHANGE_FIELD_MERGED_DEAL,
  CHANGE_FIELD_OWNER_ID,
  REMOVED_USER_LABEL,
  UNAVAILABLE_RECORD_LABEL,
} from "@/constants/changeLogFields";
import type { Db } from "@/db/client";
import { deals, leads, organizations, persons, pipelines, users } from "@/db/schema";
import { dealVisibilityPredicate, type VisibilityCtx } from "@/features/permissions/sql";
import type { EntityType } from "@/types/entityRef";
import type { DealVisibilitySession } from "@/types/session";

type RefTable = "user" | "deal" | "lead" | "person" | "organization";
type NameRow = { id: string; name: string };

const FIELD_TABLE: Readonly<Record<string, RefTable>> = {
  [CHANGE_FIELD_OWNER_ID]: "user",
  [CHANGE_FIELD_MERGED_DEAL]: "deal",
  [CHANGE_FIELD_DUPLICATED_FROM_DEAL]: "deal",
  [CHANGE_FIELD_CREATED_FROM_DEAL]: "deal",
  [CHANGE_FIELD_CONVERTED_DEAL]: "deal",
  [CHANGE_FIELD_CONVERTED_TO_LEAD]: "lead",
};

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refTableFor(field: string, entityType: EntityType): RefTable | null {
  if (field === CHANGE_FIELD_MERGE) {
    return entityType === "person" || entityType === "organization" ? entityType : null;
  }
  return FIELD_TABLE[field] ?? null;
}

function refId(value: unknown): string | null {
  return typeof value === "string" && UUID_SHAPE.test(value) ? value.toLowerCase() : null;
}

function toCtx(viewer: DealVisibilitySession): VisibilityCtx {
  return {
    userId: viewer.userId,
    isAdmin: viewer.isAdmin,
    isActive: viewer.isActive,
    sessionLive: viewer.sessionLive,
    groupIds: viewer.visibilityGroupIds,
    managedUserIds: viewer.managedUserIds ?? [],
  };
}

function contactVisible(ctx: VisibilityCtx, table: typeof persons | typeof organizations): SQL {
  return dealVisibilityPredicate(ctx, {
    ownerId: sql`${table.ownerId}`,
    visibilityLevel: sql`${table.visibilityLevel}`,
    visibilityGroupId: sql`${table.visibilityGroupId}`,
    visibleToUserIds: sql`${table.visibleToUserIds}`,
    pipelineVisibilityGroupId: sql`NULL`,
  });
}

function selectVisibleNames(
  db: Db,
  viewer: DealVisibilitySession,
  table: RefTable,
  ids: string[],
): Promise<NameRow[]> {
  const ctx = toCtx(viewer);
  switch (table) {
    case "user":
      return db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, ids));
    case "deal":
      return db
        .select({ id: deals.id, name: deals.title })
        .from(deals)
        .innerJoin(pipelines, eq(pipelines.id, deals.pipelineId))
        .where(
          and(
            inArray(deals.id, ids),
            eq(pipelines.isArchived, false),
            dealVisibilityPredicate(ctx, {
              ownerId: sql`${deals.ownerId}`,
              visibilityLevel: sql`${deals.visibilityLevel}`,
              visibilityGroupId: sql`${deals.visibilityGroupId}`,
              visibleToUserIds: sql`${deals.visibleToUserIds}`,
              pipelineVisibilityGroupId: sql`${pipelines.visibilityGroupId}`,
            }),
          ),
        );
    case "lead":
      return db
        .select({ id: leads.id, name: leads.title })
        .from(leads)
        .where(
          and(
            inArray(leads.id, ids),
            dealVisibilityPredicate(ctx, {
              ownerId: sql`${leads.ownerId}`,
              visibilityLevel: sql`${leads.visibilityLevel}`,
              visibilityGroupId: sql`${leads.visibilityGroupId}`,
              visibleToUserIds: sql`${leads.visibleToUserIds}`,
              pipelineVisibilityGroupId: sql`NULL`,
            }),
          ),
        );
    case "person":
      return db
        .select({ id: persons.id, name: persons.name })
        .from(persons)
        .where(and(inArray(persons.id, ids), contactVisible(ctx, persons)));
    case "organization":
      return db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(and(inArray(organizations.id, ids), contactVisible(ctx, organizations)));
  }
}

export async function resolveChangeLogRefNames<
  E extends { field: string; oldValue: unknown; newValue: unknown },
>(
  db: Db,
  viewer: DealVisibilitySession,
  entityType: EntityType,
  entries: E[],
  signal: AbortSignal,
): Promise<E[]> {
  const idsByTable = new Map<RefTable, Set<string>>();
  for (const e of entries) {
    const table = refTableFor(e.field, entityType);
    if (table === null) continue;
    const ids = idsByTable.get(table) ?? new Set<string>();
    for (const v of [e.oldValue, e.newValue]) {
      const id = refId(v);
      if (id !== null) ids.add(id);
    }
    idsByTable.set(table, ids);
  }
  if (idsByTable.size === 0) return entries;

  signal.throwIfAborted();
  const lookups = await Promise.all(
    [...idsByTable]
      .filter(([, ids]) => ids.size > 0)
      .map(async ([table, ids]) => {
        const rows = await selectVisibleNames(db, viewer, table, [...ids]);
        return [table, new Map(rows.map((r) => [r.id, r.name]))] as const;
      }),
  );
  signal.throwIfAborted();
  const namesByTable = new Map(lookups);

  return entries.map((e) => {
    const table = refTableFor(e.field, entityType);
    if (table === null) return e;
    const names = namesByTable.get(table);
    const missing = table === "user" ? REMOVED_USER_LABEL : UNAVAILABLE_RECORD_LABEL;
    const resolve = (v: unknown): unknown => {
      const id = refId(v);
      return id === null ? v : (names?.get(id) ?? missing);
    };
    return { ...e, oldValue: resolve(e.oldValue), newValue: resolve(e.newValue) };
  });
}
