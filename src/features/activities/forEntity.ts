import { and, eq, isNull } from "drizzle-orm";
import type { VisibilityLevel } from "@/constants/visibility";
import type { Db } from "@/db/client";
import {
  type Activity,
  activities,
  activityTypes,
  deals,
  organizations,
  persons,
  users,
} from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { sanitizeAuthorHtml } from "@/features/email/sanitizeHtml";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import type { CalendarActivity } from "./calendar";
import { isActivityOverdue } from "./overdue";
import { linkedParentVisible } from "./parentLinkVisibility";
import { resolveActivityVisibility } from "./visibility";

interface ActivityRow {
  id: string;
  subject: string;
  dueAt: Date | null;
  allDay: boolean;
  durationMinutes: number | null;
  typeKey: string;
  done: boolean;
  doneAt: Date | null;
  dealId: string | null;
  dealTitle: string | null;
  leadId: string | null;
  leadVisibleId: string | null;
  leadOwnerId: string | null;
  leadVisibilityLevel: VisibilityLevel | null;
  leadVisibilityGroupId: string | null;
  leadVisibleToUserIds: string[] | null;
  personId: string | null;
  orgId: string | null;
  personVisibleId: string | null;
  orgVisibleId: string | null;
  personName: string | null;
  orgName: string | null;
  personOwnerId: string | null;
  personVisibilityLevel: VisibilityLevel | null;
  personVisibilityGroupId: string | null;
  personVisibleToUserIds: string[] | null;
  orgOwnerId: string | null;
  orgVisibilityLevel: VisibilityLevel | null;
  orgVisibilityGroupId: string | null;
  orgVisibleToUserIds: string[] | null;
  ownerId: string;
  ownerName: string | null;
  assigneeId: string;
  typeId: string;
  note: string | null;
  location: string | null;
  videoCallUrl: string | null;
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    typeId: row.typeId,
    subject: row.subject,
    priority: null,
    dueAt: row.dueAt,
    allDay: row.allDay,
    endAt: null,
    durationMinutes: row.durationMinutes,
    done: row.done,
    doneAt: row.doneAt,
    ownerId: row.ownerId,
    assigneeId: row.assigneeId,
    dealId: row.dealId,
    leadId: row.leadId,
    personId: row.personId,
    orgId: row.orgId,
    customFields: {},
    location: null,
    note: null,
    videoCallUrl: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
  };
}

function linkedRecord(
  kind: "person" | "organization",
  visibleId: string | null,
  ownerId: string | null,
  level: VisibilityLevel | null,
  groupId: string | null,
  visibleTo: string[] | null,
): VisiblePersonOrOrg | null {
  if (visibleId === null || level === null) return null;
  return {
    kind,
    ownerId,
    visibilityLevel: level,
    visibilityGroupId: groupId,
    visibleToUserIds: visibleTo ?? [],
  };
}

function toCalendarActivity(
  row: ActivityRow,
  now: number,
  leadOk: boolean,
  personOk: boolean,
  orgOk: boolean,
): CalendarActivity | null {
  if (row.dueAt === null) return null;
  return {
    id: row.id,
    subject: row.subject,
    dueAt: row.dueAt,
    allDay: row.allDay,
    durationMinutes: row.durationMinutes,
    typeKey: row.typeKey,
    done: row.done,
    doneAt: row.doneAt,
    dealId: row.dealId,
    dealTitle: row.dealTitle,
    leadId: leadOk ? row.leadVisibleId : null,
    personId: personOk ? row.personVisibleId : null,
    orgId: orgOk ? row.orgVisibleId : null,
    overdue: isActivityOverdue(row.dueAt, row.allDay, row.done, now),
    ownerName: row.ownerName,
    note: row.note === null ? null : sanitizeAuthorHtml(row.note),
    location: row.location,
    videoCallUrl: row.videoCallUrl,
    personName: personOk ? row.personName : null,
    orgName: orgOk ? row.orgName : null,
  };
}

export async function listActivitiesForEntity(
  db: Db,
  actor: PermSetUser,
  entityType: "deal" | "person" | "organization",
  entityId: string,
  signal: AbortSignal,
): Promise<CalendarActivity[]> {
  signal.throwIfAborted();
  const now = Date.now();

  const fkCondition =
    entityType === "deal"
      ? eq(activities.dealId, entityId)
      : entityType === "person"
        ? eq(activities.personId, entityId)
        : eq(activities.orgId, entityId);

  const rows: ActivityRow[] = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      dueAt: activities.dueAt,
      allDay: activities.allDay,
      durationMinutes: activities.durationMinutes,
      typeKey: activityTypes.key,
      done: activities.done,
      doneAt: activities.doneAt,
      dealId: activities.dealId,
      dealTitle: deals.title,
      leadId: activities.leadId,
      leadVisibleId: leads.id,
      leadOwnerId: leads.ownerId,
      leadVisibilityLevel: leads.visibilityLevel,
      leadVisibilityGroupId: leads.visibilityGroupId,
      leadVisibleToUserIds: leads.visibleToUserIds,
      personId: activities.personId,
      orgId: activities.orgId,
      personVisibleId: persons.id,
      orgVisibleId: organizations.id,
      personName: persons.name,
      orgName: organizations.name,
      personOwnerId: persons.ownerId,
      personVisibilityLevel: persons.visibilityLevel,
      personVisibilityGroupId: persons.visibilityGroupId,
      personVisibleToUserIds: persons.visibleToUserIds,
      orgOwnerId: organizations.ownerId,
      orgVisibilityLevel: organizations.visibilityLevel,
      orgVisibilityGroupId: organizations.visibilityGroupId,
      orgVisibleToUserIds: organizations.visibleToUserIds,
      ownerId: activities.ownerId,
      ownerName: users.name,
      assigneeId: activities.assigneeId,
      typeId: activities.typeId,
      note: activities.note,
      location: activities.location,
      videoCallUrl: activities.videoCallUrl,
    })
    .from(activities)
    .innerJoin(activityTypes, eq(activities.typeId, activityTypes.id))
    .leftJoin(users, eq(users.id, activities.assigneeId))
    .leftJoin(deals, and(eq(deals.id, activities.dealId), isNull(deals.deletedAt)))
    .leftJoin(leads, and(eq(leads.id, activities.leadId), isNull(leads.deletedAt)))
    .leftJoin(persons, and(eq(persons.id, activities.personId), isNull(persons.deletedAt)))
    .leftJoin(
      organizations,
      and(eq(organizations.id, activities.orgId), isNull(organizations.deletedAt)),
    )
    .where(and(isNull(activities.deletedAt), fkCondition));

  const out: CalendarActivity[] = [];
  for (const row of rows) {
    signal.throwIfAborted();
    const vis = await resolveActivityVisibility(db, toActivity(row), signal);
    if (vis === null || !canSee(actor, vis)) continue;
    const personRec = linkedRecord(
      "person",
      row.personVisibleId,
      row.personOwnerId,
      row.personVisibilityLevel,
      row.personVisibilityGroupId,
      row.personVisibleToUserIds,
    );
    const orgRec = linkedRecord(
      "organization",
      row.orgVisibleId,
      row.orgOwnerId,
      row.orgVisibilityLevel,
      row.orgVisibilityGroupId,
      row.orgVisibleToUserIds,
    );
    const personOk = personRec !== null && canSee(actor, personRec);
    const orgOk = orgRec !== null && canSee(actor, orgRec);
    const leadOk = linkedParentVisible(actor, "lead", row.leadVisibleId, {
      ownerId: row.leadOwnerId,
      level: row.leadVisibilityLevel,
      groupId: row.leadVisibilityGroupId,
      visibleTo: row.leadVisibleToUserIds,
    });
    const activity = toCalendarActivity(row, now, leadOk, personOk, orgOk);
    if (activity !== null) out.push(activity);
  }
  return out;
}
