import { and, desc, eq, gte, isNotNull, isNull, lt, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activities, activityTypes, deals, organizations, persons, pipelines } from "@/db/schema";
import { buildActivityVisibility } from "@/features/activities/activityVisibility";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { dealVisibilityPredicate } from "@/features/permissions/sql";

export type ContactEntity = "person" | "organization";

export interface EngagementTimelineOptions {
  entity: ContactEntity;
  monthsBack: number;
  ownerId: string | null;
  typeKey: string | null;
  now?: Date;
  maxRows?: number;
}

interface EngagementMarker {
  id: string;
  typeKey: string;
  subject: string;
  dueAtIso: string;
  done: boolean;
}

export interface EngagementLane {
  contactId: string;
  contactName: string;
  byMonth: Record<string, EngagementMarker[]>;
  total: number;
  lastActivityMs: number;
}

export interface EngagementTimeline {
  months: string[];
  lanes: EngagementLane[];
}

const NO_PARTICIPANTS: string[] = [];
const MAX_ROWS = 5000;

function monthKey(y: number, mZeroBased: number): string {
  return `${y}-${String(mZeroBased + 1).padStart(2, "0")}`;
}

function monthKeysForPeriod(now: Date, monthsBack: number): string[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
  }
  return keys;
}

function periodStart(now: Date, monthsBack: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1));
}

type EngagementRow = Awaited<ReturnType<typeof selectRows>>[number];

interface ResolvedRow {
  contactId: string;
  contactName: string;
  monthKey: string;
  marker: EngagementMarker;
}

function laneVisibilityPredicate(entity: ContactEntity, actor: PermSetUser): SQL {
  const ctx = {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    groupIds: [...actor.groupIds],
    managedUserIds: [...(actor.managedUserIds ?? [])],
  };
  const t = entity === "person" ? persons : organizations;
  return dealVisibilityPredicate(ctx, {
    ownerId: sql`${t.ownerId}`,
    visibilityLevel: sql`${t.visibilityLevel}`,
    visibilityGroupId: sql`${t.visibilityGroupId}`,
    visibleToUserIds: sql`${t.visibleToUserIds}`,
    pipelineVisibilityGroupId: sql`NULL::uuid`,
  });
}

function laneContactVisible(
  row: EngagementRow,
  entity: ContactEntity,
  actor: PermSetUser,
): boolean {
  if (entity === "person") {
    if (row.personLevel === null) return false;
    return canSee(actor, {
      kind: "person",
      ownerId: row.personOwnerId,
      visibilityLevel: row.personLevel,
      visibilityGroupId: row.personGroupId,
      visibleToUserIds: row.personVisibleTo ?? [],
    });
  }
  if (row.orgLevel === null) return false;
  return canSee(actor, {
    kind: "organization",
    ownerId: row.orgOwnerId,
    visibilityLevel: row.orgLevel,
    visibilityGroupId: row.orgGroupId,
    visibleToUserIds: row.orgVisibleTo ?? [],
  });
}

function resolveRow(
  row: EngagementRow,
  entity: ContactEntity,
  monthSet: Set<string>,
  actor: PermSetUser,
): ResolvedRow | null {
  if (row.dueAt === null) return null;
  const key = monthKey(row.dueAt.getUTCFullYear(), row.dueAt.getUTCMonth());
  if (!monthSet.has(key)) return null;
  const vis = buildActivityVisibility(row, NO_PARTICIPANTS);
  if (vis === null || !canSee(actor, vis)) return null;
  const contactId = entity === "person" ? row.personVisibleId : row.orgVisibleId;
  const contactName = entity === "person" ? row.personName : row.orgName;
  if (contactId === null || contactName === null) return null;
  if (!laneContactVisible(row, entity, actor)) return null;
  return {
    contactId,
    contactName,
    monthKey: key,
    marker: {
      id: row.id,
      typeKey: row.typeKey,
      subject: row.subject,
      dueAtIso: row.dueAt.toISOString(),
      done: row.done,
    },
  };
}

function addToLane(laneMap: Map<string, EngagementLane>, r: ResolvedRow, dueMs: number): void {
  let lane = laneMap.get(r.contactId);
  if (lane === undefined) {
    lane = {
      contactId: r.contactId,
      contactName: r.contactName,
      byMonth: {},
      total: 0,
      lastActivityMs: 0,
    };
    laneMap.set(r.contactId, lane);
  }
  const bucket = lane.byMonth[r.monthKey] ?? [];
  bucket.push(r.marker);
  lane.byMonth[r.monthKey] = bucket;
  lane.total += 1;
  lane.lastActivityMs = Math.max(lane.lastActivityMs, dueMs);
}

function selectRows(db: Db, preds: ReturnType<typeof and>[], maxRows: number) {
  return db
    .select({
      id: activities.id,
      subject: activities.subject,
      dueAt: activities.dueAt,
      done: activities.done,
      typeKey: activityTypes.key,
      assigneeId: activities.assigneeId,
      dealId: activities.dealId,
      personId: activities.personId,
      orgId: activities.orgId,
      dealOwnerId: deals.ownerId,
      dealLevel: deals.visibilityLevel,
      dealGroupId: deals.visibilityGroupId,
      dealVisibleTo: deals.visibleToUserIds,
      pipelineVg: pipelines.visibilityGroupId,
      pipelineArchived: pipelines.isArchived,
      personVisibleId: persons.id,
      personName: persons.name,
      personOwnerId: persons.ownerId,
      personLevel: persons.visibilityLevel,
      personGroupId: persons.visibilityGroupId,
      personVisibleTo: persons.visibleToUserIds,
      orgVisibleId: organizations.id,
      orgName: organizations.name,
      orgOwnerId: organizations.ownerId,
      orgLevel: organizations.visibilityLevel,
      orgGroupId: organizations.visibilityGroupId,
      orgVisibleTo: organizations.visibleToUserIds,
    })
    .from(activities)
    .innerJoin(activityTypes, eq(activityTypes.id, activities.typeId))
    .leftJoin(deals, and(eq(deals.id, activities.dealId), isNull(deals.deletedAt)))
    .leftJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .leftJoin(persons, and(eq(persons.id, activities.personId), isNull(persons.deletedAt)))
    .leftJoin(
      organizations,
      and(eq(organizations.id, activities.orgId), isNull(organizations.deletedAt)),
    )
    .where(and(...preds))
    .orderBy(desc(activities.dueAt))
    .limit(maxRows);
}

export async function engagementTimeline(
  db: Db,
  actor: PermSetUser,
  opts: EngagementTimelineOptions,
  signal: AbortSignal,
): Promise<EngagementTimeline> {
  signal.throwIfAborted();
  const now = opts.now ?? new Date();
  const months = monthKeysForPeriod(now, opts.monthsBack);
  const monthSet = new Set(months);
  const start = periodStart(now, opts.monthsBack);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const entityFk =
    opts.entity === "person" ? isNotNull(activities.personId) : isNotNull(activities.orgId);
  const preds = [
    isNull(activities.deletedAt),
    entityFk,
    gte(activities.dueAt, start),
    lt(activities.dueAt, end),
    laneVisibilityPredicate(opts.entity, actor),
  ];
  if (opts.ownerId !== null) preds.push(eq(activities.assigneeId, opts.ownerId));
  if (opts.typeKey !== null) preds.push(eq(activityTypes.key, opts.typeKey));

  const rows = await selectRows(db, preds, opts.maxRows ?? MAX_ROWS);
  signal.throwIfAborted();

  const laneMap = new Map<string, EngagementLane>();
  for (const row of rows) {
    const resolved = resolveRow(row, opts.entity, monthSet, actor);
    if (resolved === null || row.dueAt === null) continue;
    addToLane(laneMap, resolved, row.dueAt.getTime());
  }

  const lanes = [...laneMap.values()].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  for (const lane of lanes) {
    for (const k of Object.keys(lane.byMonth)) lane.byMonth[k]?.reverse();
  }
  return { months, lanes };
}
