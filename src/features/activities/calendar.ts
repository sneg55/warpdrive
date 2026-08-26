import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { VisibilityLevel } from "@/constants/visibility";
import type { Db } from "@/db/client";
import { activities, activityTypes, users } from "@/db/schema";
import { deals } from "@/db/schema/deals";
import { leads } from "@/db/schema/leads";
import { organizations } from "@/db/schema/organizations";
import { persons } from "@/db/schema/persons";
import { pipelines } from "@/db/schema/pipelines";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { buildActivityVisibility } from "./activityVisibility";
import { isActivityOverdue } from "./overdue";
import { linkedParentVisible } from "./parentLinkVisibility";
import { loadParentlessParticipants } from "./visibility";

export interface CalendarActivity {
  id: string;
  subject: string;
  dueAt: Date;
  // No time was set; the editor must not echo the stored midnight back.
  allDay: boolean;
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
  // Parent title from the deletedAt-filtered join: a null title against a non-null dealId means the
  // deal is soft-deleted, so a chip must neither name it nor link to it. Optional because only
  // calendarRange selects it; the history-card builders leave it undefined.
  dealTitle?: string | null;
  // The other primary parent (activities.lead_id, mutually exclusive with deal_id). Same rules.
  leadId?: string | null;
  leadTitle?: string | null;
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
  allDay: boolean;
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
  dealTitle: string | null;
  leadVisibleId: string | null;
  leadTitle: string | null;
  personName: string | null;
  orgName: string | null;
  leadOwnerId: string | null;
  leadLevel: VisibilityLevel | null;
  leadGroupId: string | null;
  leadVisibleTo: string[] | null;
  personOwnerId: string | null;
  personLevel: VisibilityLevel | null;
  personGroupId: string | null;
  personVisibleTo: string[] | null;
  orgOwnerId: string | null;
  orgLevel: VisibilityLevel | null;
  orgGroupId: string | null;
  orgVisibleTo: string[] | null;
  ownerName: string | null;
  assigneeId: string | null;
}

// Which linked parents the actor may be told about. Seeing the activity comes from its dominant
// parent, which grants nothing about the secondary records hanging off it.
interface LinkGates {
  lead: boolean;
  person: boolean;
  org: boolean;
}

function linkGates(actor: PermSetUser, row: CalendarRow): LinkGates {
  return {
    lead: linkedParentVisible(actor, "lead", row.leadVisibleId, {
      ownerId: row.leadOwnerId,
      level: row.leadLevel,
      groupId: row.leadGroupId,
      visibleTo: row.leadVisibleTo,
    }),
    person: linkedParentVisible(actor, "person", row.personVisibleId, {
      ownerId: row.personOwnerId,
      level: row.personLevel,
      groupId: row.personGroupId,
      visibleTo: row.personVisibleTo,
    }),
    org: linkedParentVisible(actor, "organization", row.orgVisibleId, {
      ownerId: row.orgOwnerId,
      level: row.orgLevel,
      groupId: row.orgGroupId,
      visibleTo: row.orgVisibleTo,
    }),
  };
}

function toCalendarActivity(
  row: CalendarRow,
  dueAt: Date,
  now: number,
  gates: LinkGates,
): CalendarActivity {
  return {
    id: row.id,
    subject: row.subject,
    dueAt,
    allDay: row.allDay,
    endAt: row.endAt,
    durationMinutes: row.durationMinutes,
    typeKey: row.typeKey,
    done: row.done,
    dealId: row.dealId,
    // The deal is the dominant parent, so seeing the activity already means seeing the deal.
    dealTitle: row.dealTitle,
    leadId: gates.lead ? row.leadVisibleId : null,
    leadTitle: gates.lead ? row.leadTitle : null,
    personId: gates.person ? row.personVisibleId : null,
    orgId: gates.org ? row.orgVisibleId : null,
    personName: gates.person ? row.personName : null,
    orgName: gates.org ? row.orgName : null,
    overdue: isActivityOverdue(dueAt, row.allDay, row.done, now),
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
      allDay: activities.allDay,
      endAt: activities.endAt,
      durationMinutes: activities.durationMinutes,
      typeKey: activityTypes.key,
      done: activities.done,
      dealId: activities.dealId,
      personId: activities.personId,
      orgId: activities.orgId,
      personVisibleId: persons.id,
      orgVisibleId: organizations.id,
      dealTitle: deals.title,
      leadVisibleId: leads.id,
      leadTitle: leads.title,
      leadOwnerId: leads.ownerId,
      leadLevel: leads.visibilityLevel,
      leadGroupId: leads.visibilityGroupId,
      leadVisibleTo: leads.visibleToUserIds,
      personName: persons.name,
      orgName: organizations.name,
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
    .leftJoin(leads, and(eq(leads.id, activities.leadId), isNull(leads.deletedAt)))
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
    out.push(toCalendarActivity(row, row.dueAt, now, linkGates(actor, row)));
  }
  return out;
}
