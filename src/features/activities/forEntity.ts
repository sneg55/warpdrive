// listActivitiesForEntity: per-entity activity list for the deal workspace (and
// future person/org detail pages). Reuses resolveActivityVisibility + canSee from
// calendarRange so visibility is consistent and the audited gate cannot diverge.
import { and, eq, isNull } from "drizzle-orm";
import type { VisibilityLevel } from "@/constants/visibility";
import type { Db } from "@/db/client";
import {
  type Activity,
  activities,
  activityTypes,
  organizations,
  persons,
  users,
} from "@/db/schema";
import { sanitizeAuthorHtml } from "@/features/email/sanitizeHtml";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import type { CalendarActivity } from "./calendar";
import { resolveActivityVisibility } from "./visibility";

interface ActivityRow {
  id: string;
  subject: string;
  dueAt: Date | null;
  durationMinutes: number | null;
  typeKey: string;
  done: boolean;
  doneAt: Date | null;
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  // Link-safe ids from the deletedAt-filtered joins: null when the linked person/org is soft-
  // deleted, so the UI never renders a link to a contact whose detail page 404s. The raw personId/
  // orgId above stay for visibility/parent resolution (a deleted parent still gates the activity).
  personVisibleId: string | null;
  orgVisibleId: string | null;
  // Display names from the same deletedAt-filtered joins (null when unlinked or soft-deleted).
  personName: string | null;
  orgName: string | null;
  // Visibility columns for the linked person/org, so the name + link are only disclosed when the
  // actor can see that record. The activity itself is authorized through its deal parent, which does
  // NOT imply the actor may see an owner-only linked contact (they must be gated separately).
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
    endAt: null,
    durationMinutes: row.durationMinutes,
    done: row.done,
    doneAt: row.doneAt,
    ownerId: row.ownerId,
    assigneeId: row.assigneeId,
    dealId: row.dealId,
    // forEntity lists deal/person/org activities; lead-scoped rows are handled by leadTimeline.
    leadId: null,
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

// Build a person/org visibility record from the linked-contact columns, or null when there is no
// (non-soft-deleted) linked record. Used to gate the disclosed name + link by the actor's access.
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
  personOk: boolean,
  orgOk: boolean,
): CalendarActivity | null {
  if (row.dueAt === null) return null;
  return {
    id: row.id,
    subject: row.subject,
    dueAt: row.dueAt,
    durationMinutes: row.durationMinutes,
    typeKey: row.typeKey,
    done: row.done,
    doneAt: row.doneAt,
    dealId: row.dealId,
    // Gate the link + name by the actor's visibility of the linked contact: the activity is
    // authorized via its deal parent, which does not imply access to an owner-only linked record.
    personId: personOk ? row.personVisibleId : null,
    orgId: orgOk ? row.orgVisibleId : null,
    overdue: row.done === false && row.dueAt.getTime() < now,
    ownerName: row.ownerName,
    // Defense in depth: re-sanitize author HTML at the read boundary (same pattern as
    // emailAuthoringReads). Idempotent on already-clean HTML written via createActivity, so no
    // behavior change for the normal path, but the render site no longer trusts every write path.
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

  // Build the where clause based on entityType. The FK column names in the
  // activities table map directly: deal_id, person_id, org_id. Lead-scoped activities
  // are served by the separate lead.leadTimeline procedure, not this function.
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
      durationMinutes: activities.durationMinutes,
      typeKey: activityTypes.key,
      done: activities.done,
      doneAt: activities.doneAt,
      dealId: activities.dealId,
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
    .leftJoin(users, eq(users.id, activities.ownerId))
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
    const activity = toCalendarActivity(row, now, personOk, orgOk);
    if (activity !== null) out.push(activity);
  }
  return out;
}
