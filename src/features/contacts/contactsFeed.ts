import { and, asc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activities, deals, organizations, persons, pipelines } from "@/db/schema";
import { buildActivityVisibility } from "@/features/activities/activityVisibility";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";

export interface ContactsFeedRow {
  id: string;
  subject: string;
  dueAtIso: string | null;
  done: boolean;
  personId: string | null;
  personName: string | null;
  orgId: string | null;
  orgName: string | null;
}

export interface ContactsFeedOptions {
  limit: number;
  before?: string | null;
  beforeId?: string | null;
}

const NO_PARTICIPANTS: string[] = [];

const OVER_FETCH_MULTIPLIER = 3;
const MAX_FETCH = 300;

export async function contactsFeed(
  db: Db,
  actor: PermSetUser,
  opts: ContactsFeedOptions,
  signal: AbortSignal,
): Promise<ContactsFeedRow[]> {
  signal.throwIfAborted();

  const preds = [
    isNull(activities.deletedAt),
    or(isNotNull(activities.personId), isNotNull(activities.orgId)),
  ];
  if (opts.before != null && opts.beforeId != null) {
    const before = new Date(opts.before);
    preds.push(
      or(
        lt(activities.dueAt, before),
        and(eq(activities.dueAt, before), gt(activities.id, opts.beforeId)),
      ),
    );
  }

  const fetchWindow = (fetchLimit: number) =>
    db
      .select({
        id: activities.id,
        subject: activities.subject,
        dueAt: activities.dueAt,
        done: activities.done,
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
      .leftJoin(deals, and(eq(deals.id, activities.dealId), isNull(deals.deletedAt)))
      .leftJoin(pipelines, eq(pipelines.id, deals.pipelineId))
      .leftJoin(persons, and(eq(persons.id, activities.personId), isNull(persons.deletedAt)))
      .leftJoin(
        organizations,
        and(eq(organizations.id, activities.orgId), isNull(organizations.deletedAt)),
      )
      .where(and(...preds))
      .orderBy(sql`${activities.dueAt} DESC NULLS LAST`, asc(activities.id))
      .limit(fetchLimit);

  type RawRow = Awaited<ReturnType<typeof fetchWindow>>[number];

  function filterVisible(rawRows: RawRow[]): ContactsFeedRow[] {
    const out: ContactsFeedRow[] = [];
    for (const row of rawRows) {
      const vis = buildActivityVisibility(row, NO_PARTICIPANTS);
      if (vis === null || !canSee(actor, vis)) continue;
      out.push({
        id: row.id,
        subject: row.subject,
        dueAtIso: row.dueAt === null ? null : row.dueAt.toISOString(),
        done: row.done,
        personId: row.personVisibleId,
        personName: row.personName,
        orgId: row.orgVisibleId,
        orgName: row.orgName,
      });
    }
    return out;
  }

  let fetchCount = Math.min(opts.limit * OVER_FETCH_MULTIPLIER, MAX_FETCH);
  let rawRows = await fetchWindow(fetchCount);
  signal.throwIfAborted();
  let visible = filterVisible(rawRows);

  if (visible.length < opts.limit && rawRows.length === fetchCount && fetchCount < MAX_FETCH) {
    fetchCount = MAX_FETCH;
    rawRows = await fetchWindow(fetchCount);
    signal.throwIfAborted();
    visible = filterVisible(rawRows);
  }

  return visible.slice(0, opts.limit);
}
