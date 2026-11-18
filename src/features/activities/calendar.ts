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
  allDay: boolean;
  endAt?: Date | null;
  durationMinutes: number | null;
  typeKey: string;
  done: boolean;
  doneAt?: Date | null;
  dealId: string | null;
  dealTitle?: string | null;
  leadId?: string | null;
  leadTitle?: string | null;
  personId: string | null;
  orgId: string | null;
  overdue: boolean;
  assigneeId?: string | null;
  ownerName: string | null;
  note?: string | null;
  location?: string | null;
  videoCallUrl?: string | null;
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
    .leftJoin(users, eq(users.id, activities.assigneeId))
    .leftJoin(deals, and(eq(deals.id, activities.dealId), isNull(deals.deletedAt)))
    .leftJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .leftJoin(leads, and(eq(leads.id, activities.leadId), isNull(leads.deletedAt)))
    .leftJoin(persons, and(eq(persons.id, activities.personId), isNull(persons.deletedAt)))
    .leftJoin(
      organizations,
      and(eq(organizations.id, activities.orgId), isNull(organizations.deletedAt)),
    )
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
    if (row.dueAt === null) continue;
    const vis = buildActivityVisibility(row, participantsByActivity.get(row.id) ?? []);
    if (vis === null || !canSee(actor, vis)) continue;
    out.push(toCalendarActivity(row, row.dueAt, now, linkGates(actor, row)));
  }
  return out;
}
