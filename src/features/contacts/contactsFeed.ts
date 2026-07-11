// Cross-contact activity feed (Wave 3, Task 22): "recent activity across all contacts the actor
// can see," reached from the Contacts secondary nav. Unlike contactTimeline.ts (a SINGLE
// person/org's Focus/History feed), this scans activities across every person/org at once, so it
// must stay a single bounded, joined query (no per-contact round trips).
//
// Visibility reuses buildActivityVisibility/canSee exactly as the Activities table
// (activityRows.ts) does: same joined deal/person/org parent columns, same dominant-parent
// precedence (deal > person > org > parentless). That matters here specifically because a
// contact-linked activity can ALSO be deal-linked (e.g. an activity added from the deal
// workspace that also tags a person): under dominant-parent precedence the DEAL's visibility
// (and its pipeline restriction) governs, not the person's. A naive "visible if its person OR
// org is visible" check would leak that deal-restricted activity's subject/due-date to anyone
// who can merely see the tagged contact, which is exactly the kind of divergent, re-derived
// visibility rule the project's canSee/buildActivityVisibility split exists to prevent.
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
  // Tiebreaker for `before`. ORDER BY breaks ties on dueAt with asc(id), so the cursor
  // predicate has to break ties the same way: (dueAt < before) OR (dueAt = before AND id >
  // beforeId). Only applied when BOTH before and beforeId are provided; every call site
  // (router, client, tests) threads them together.
  beforeId?: string | null;
}

// Every activity linked to a visible person or org can never be "parentless" under
// activityVisibilityFromParents (that branch only fires when deal/person/org are ALL null, which
// the WHERE clause below rules out), so there is never a participant set to pre-load here.
const NO_PARTICIPANTS: string[] = [];

// Over-fetch pattern (matches notifications/feed.ts's getFeed): visibility is filtered
// in-process AFTER the SQL LIMIT, so a plain "LIMIT opts.limit" can hand back a raw window
// that's almost entirely invisible to a visibility-restricted actor, reading back as an empty
// or falsely "exhausted" page even though plenty of older visible rows exist further down the
// table. Fetching a bigger raw window up front, and growing it once (bounded, never looping) if
// that window still comes up short, fixes that.
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
  // Compound keyset cursor on (dueAt, id), matching the ORDER BY's own tiebreaker below. A
  // dueAt-only cursor drops whichever row of a due_at tie sorts second at a page boundary
  // (same-day-no-time activities collide on this exactly). A row's own due_at can still be NULL,
  // so once a cursor is in play, undated rows fall out of every later page (NULL < anything is
  // unknown in SQL, never true): a known, accepted tradeoff. Page 1 (before: null) still returns
  // them, since NULLS LAST places them after all dated rows there.
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
      // NULLS LAST is explicit: Postgres's DESC default is NULLS FIRST, which would float undated
      // activities to the top of a "newest first" feed instead of the bottom.
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
        // Link-safe ids from the deletedAt-filtered joins (null when the linked contact is
        // soft-deleted), matching forEntity.ts/activityRows.ts so the feed never links to a 404.
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

  // The first window came up short of a full page and the SQL LIMIT wasn't actually exhausted
  // (fetchCount rows came back, so more may exist past this window): grow once to MAX_FETCH and
  // retry. Bounded to a single extra round trip, never an unbounded loop; if that still isn't
  // enough (pathological visibility fragmentation beyond MAX_FETCH rows), returning fewer than
  // opts.limit here is an accepted tradeoff, same as notifications/feed.ts's own MAX_FETCH cap.
  if (visible.length < opts.limit && rawRows.length === fetchCount && fetchCount < MAX_FETCH) {
    fetchCount = MAX_FETCH;
    rawRows = await fetchWindow(fetchCount);
    signal.throwIfAborted();
    visible = filterVisible(rawRows);
  }

  return visible.slice(0, opts.limit);
}
