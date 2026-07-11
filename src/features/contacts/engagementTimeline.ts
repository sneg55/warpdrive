// Per-contact engagement timeline (CO-4): the Pipedrive "how recently have I engaged each
// contact" view. Unlike contactsFeed (a flat, day-grouped per-activity list) this rolls activities
// up PER CONTACT, bucketed by month across a period window, for the person/org engagement grid.
//
// Visibility is a TWO-layer gate. (1) The lane CONTACT is gated in SQL: laneVisibilityPredicate is
// pushed into the WHERE clause so the raw-scan row cap (limit) counts only activities on contacts
// the actor can see. Without it, a restricted actor with more than `maxRows` newer in-period
// activities they cannot see would fill the cap with invisible rows and starve older visible lanes,
// returning an empty/incomplete timeline. (2) buildActivityVisibility/canSee still authorizes each
// ACTIVITY in-process under dominant-parent precedence (deal > person > org), and laneContactVisible
// re-checks the contact, as defense-in-depth. The entity filter guarantees a person or org FK is
// set, so an activity here is never "parentless" (NO_PARTICIPANTS).
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
  // Number of month buckets ending in `now`'s month (Pipedrive's "3 months back").
  monthsBack: number;
  // Assignee filter (Pipedrive's "Owner" filter is really the assignee), or null for everyone.
  ownerId: string | null;
  // Activity-type key filter (call/meeting/...), or null for all types.
  typeKey: string | null;
  // Period anchor; defaults to the current time. Injectable so tests are deterministic.
  now?: Date;
  // Raw-scan row cap. Defaults to MAX_ROWS; injectable so tests can prove the period window keeps
  // the cap from being starved by out-of-window rows.
  maxRows?: number;
}

export interface EngagementMarker {
  id: string;
  typeKey: string;
  subject: string;
  dueAtIso: string;
  done: boolean;
}

export interface EngagementLane {
  contactId: string;
  contactName: string;
  // monthKey ("2026-05") -> that month's markers, oldest-first. Only months with activity appear.
  byMonth: Record<string, EngagementMarker[]>;
  total: number;
  // Most-recent marker's due time, for lane ordering.
  lastActivityMs: number;
}

export interface EngagementTimeline {
  // Ordered ascending month keys spanning the period (left-to-right axis).
  months: string[];
  // Lanes, most-recently-engaged contact first.
  lanes: EngagementLane[];
}

const NO_PARTICIPANTS: string[] = [];
// Safety cap: an engagement rollup wants every activity in the window, but an unbounded scan is a
// footgun. Ordered dueAt DESC so, if a tenant ever exceeds this in one period, the most recent
// activity is what survives. Documented as an MVP bound in implementation-notes.
const MAX_ROWS = 5000;

function monthKey(y: number, mZeroBased: number): string {
  return `${y}-${String(mZeroBased + 1).padStart(2, "0")}`;
}

export function monthKeysForPeriod(now: Date, monthsBack: number): string[] {
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

// The joined columns buildActivityVisibility + the contact-identity resolution below both read.
type EngagementRow = Awaited<ReturnType<typeof selectRows>>[number];

interface ResolvedRow {
  contactId: string;
  contactName: string;
  monthKey: string;
  marker: EngagementMarker;
}

// SQL lane-contact visibility (layer 1, see the module header). A NULL pipeline gate collapses
// dealVisibilityPredicate to the universal person/org record-visibility rule (mirror of canSee);
// contacts have no pipeline restriction. Same reuse pattern as search/query.ts. Pushed into the
// WHERE so the row cap counts only rows on contacts the actor can see.
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

// Layer-2 gate (see the module header): is the lane CONTACT itself visible to the actor on its own
// person/org record, independent of how the activity was authorized. null level means the contact
// row is missing/soft-deleted (LEFT JOIN), so not visible.
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

// Filter + project one row into a lane entry, or null when it is out of window / the activity is
// hidden / the lane contact is hidden or soft-deleted. Pulled out of engagementTimeline to keep
// that function under the cognitive-complexity budget.
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
  // Layer-2: never emit a lane for a contact the actor cannot see on its own record.
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
  // The period always ends in `now`'s month, so the exclusive upper bound is the first day of the
  // month AFTER it. Bounding both edges in SQL keeps out-of-window (e.g. far-future) rows from
  // consuming the row cap before in-window rows are reached, then getting dropped in grouping.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const entityFk =
    opts.entity === "person" ? isNotNull(activities.personId) : isNotNull(activities.orgId);
  const preds = [
    isNull(activities.deletedAt),
    entityFk,
    gte(activities.dueAt, start),
    lt(activities.dueAt, end),
    // Lane-contact visibility in SQL, so the row cap counts only visible-contact rows.
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

  // Rows arrive dueAt DESC; each month's markers get reversed to oldest-first for the axis.
  const lanes = [...laneMap.values()].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  for (const lane of lanes) {
    for (const k of Object.keys(lane.byMonth)) lane.byMonth[k]?.reverse();
  }
  return { months, lanes };
}
