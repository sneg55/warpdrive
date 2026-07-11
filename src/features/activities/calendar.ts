import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activities, activityTypes, users } from "@/db/schema";
import { deals } from "@/db/schema/deals";
import { organizations } from "@/db/schema/organizations";
import { persons } from "@/db/schema/persons";
import { pipelines } from "@/db/schema/pipelines";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { buildActivityVisibility } from "./activityVisibility";
import { loadParentlessParticipants } from "./visibility";

export interface CalendarActivity {
  id: string;
  subject: string;
  dueAt: Date;
  // Explicit multi-day end (Pipedrive parity, B3). Null/undefined for a single-day activity. When
  // set, the calendar range + day grouping treat the activity as spanning [dueAt, endAt] so it shows
  // on every covered day, not just its start day.
  endAt?: Date | null;
  durationMinutes: number | null;
  typeKey: string;
  done: boolean;
  // Completion timestamp (time of doing it). Optional: only the history-card builders
  // (listActivitiesForEntity, leadTimeline) select it; calendarRange leaves it undefined.
  doneAt?: Date | null;
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  overdue: boolean;
  // Assigned user id (Pipedrive's "Owner" filter is really the assignee); powers the calendar
  // owner filter (AC1). Optional like note/location: only calendarRange populates it; the other
  // CalendarActivity builders (forEntity, leadTimeline) leave it undefined.
  assigneeId?: string | null;
  // Owner (created-by) display name for the history-card footer; null when the
  // owner is unresolved (should not happen: owner_id is NOT NULL).
  ownerName: string | null;
  // Optional: only populated by listActivitiesForEntity (deal history card).
  // calendarRange's CalendarRow/toCalendarActivity don't select these yet, so they
  // stay undefined there; keeping them optional avoids forcing that builder to change.
  note?: string | null;
  location?: string | null;
  // Video call link attached in the composer. Optional: only the history-card builders
  // (listActivitiesForEntity, leadTimeline) select it; calendarRange leaves it undefined.
  videoCallUrl?: string | null;
  // Resolved display names of the linked person/org, so the history card can link
  // the record's NAME instead of the literal type word. Optional (only forEntity
  // selects them); null when there is no link or the linked record is soft-deleted.
  personName?: string | null;
  orgName?: string | null;
}

interface CalendarRow {
  id: string;
  subject: string;
  endAt: Date | null;
  durationMinutes: number | null;
  typeKey: string;
  done: boolean;
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  // Link-safe ids from the deletedAt-filtered joins: null when the linked person/org is soft-
  // deleted, so a deal-dominant activity never renders a link to a deleted secondary contact whose
  // detail page 404s. The raw personId/orgId above stay for buildActivityVisibility.
  personVisibleId: string | null;
  orgVisibleId: string | null;
  ownerName: string | null;
  assigneeId: string | null;
}

function toCalendarActivity(row: CalendarRow, dueAt: Date, now: number): CalendarActivity {
  return {
    id: row.id,
    subject: row.subject,
    dueAt,
    endAt: row.endAt,
    durationMinutes: row.durationMinutes,
    typeKey: row.typeKey,
    done: row.done,
    dealId: row.dealId,
    personId: row.personVisibleId,
    orgId: row.orgVisibleId,
    overdue: row.done === false && dueAt.getTime() < now,
    ownerName: row.ownerName,
    assigneeId: row.assigneeId,
  };
}

// In-range, non-deleted activities the actor can see. Parent visibility columns are pulled in the
// same joined query (soft-deleted parents excluded by the join predicate) and parentless-activity
// participants are batched, so visibility resolves in memory via buildActivityVisibility, the same
// path the Activities table uses. Sharing that resolver keeps the calendar from ever diverging from
// the list (or from completeActivity's per-activity gate).
export async function calendarRange(
  db: Db,
  actor: PermSetUser,
  range: { from: Date; to: Date },
  signal: AbortSignal,
): Promise<CalendarActivity[]> {
  signal.throwIfAborted();
  const now = Date.now();

  const rows = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      dueAt: activities.dueAt,
      endAt: activities.endAt,
      durationMinutes: activities.durationMinutes,
      typeKey: activityTypes.key,
      done: activities.done,
      dealId: activities.dealId,
      personId: activities.personId,
      orgId: activities.orgId,
      personVisibleId: persons.id,
      orgVisibleId: organizations.id,
      ownerName: users.name,
      assigneeId: activities.assigneeId,
      dealOwnerId: deals.ownerId,
      dealLevel: deals.visibilityLevel,
      dealGroupId: deals.visibilityGroupId,
      dealVisibleTo: deals.visibleToUserIds,
      pipelineVg: pipelines.visibilityGroupId,
      pipelineArchived: pipelines.isArchived,
      personOwnerId: persons.ownerId,
      personLevel: persons.visibilityLevel,
      personGroupId: persons.visibilityGroupId,
      personVisibleTo: persons.visibleToUserIds,
      orgOwnerId: organizations.ownerId,
      orgLevel: organizations.visibilityLevel,
      orgGroupId: organizations.visibilityGroupId,
      orgVisibleTo: organizations.visibleToUserIds,
    })
    .from(activities)
    .innerJoin(activityTypes, eq(activities.typeId, activityTypes.id))
    .leftJoin(users, eq(users.id, activities.ownerId))
    .leftJoin(deals, and(eq(deals.id, activities.dealId), isNull(deals.deletedAt)))
    .leftJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .leftJoin(persons, and(eq(persons.id, activities.personId), isNull(persons.deletedAt)))
    .leftJoin(
      organizations,
      and(eq(organizations.id, activities.orgId), isNull(organizations.deletedAt)),
    )
    // Overlap, not point-in-range: an activity intersects [from, to] when it starts on or before
    // `to` AND its end (explicit endAt, else its own dueAt) is on or after `from`. This keeps a
    // multi-day activity visible on every range its span touches, not only its start day.
    .where(
      and(
        isNull(activities.deletedAt),
        lte(activities.dueAt, range.to),
        sql`coalesce(${activities.endAt}, ${activities.dueAt}) >= ${range.from}`,
      ),
    );
  signal.throwIfAborted();

  const participantsByActivity = await loadParentlessParticipants(db, rows, signal);

  const out: CalendarActivity[] = [];
  for (const row of rows) {
    // Defensive: between excludes null dueAt, but skip explicitly before getTime().
    if (row.dueAt === null) continue;
    const vis = buildActivityVisibility(row, participantsByActivity.get(row.id) ?? []);
    if (vis === null || !canSee(actor, vis)) continue;
    out.push(toCalendarActivity(row, row.dueAt, now));
  }
  return out;
}
