import { and, asc, desc, eq, gte, isNull, lte, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { activities, activityTypes, users } from "@/db/schema";
import { deals } from "@/db/schema/deals";
import { organizations } from "@/db/schema/organizations";
import { persons } from "@/db/schema/persons";
import { pipelines } from "@/db/schema/pipelines";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertNever } from "@/types/result";
import { buildActivityVisibility } from "./activityVisibility";
import type { ActivityListFilter, ActivitySort, ActivitySortField } from "./schemas";
import { loadParentlessParticipants } from "./visibility";

// Two aliases of `users` so a single query can join both the assignee and the owner by name
// (a row's assigneeId and ownerId can reference different users).
const assigneeUser = alias(users, "assignee_user");
const ownerUser = alias(users, "owner_user");

// A fully-populated activities-table row (Pipedrive columns). dueAt is an ISO string so it can
// cross the server/client boundary.
export interface ActivityTableRow {
  id: string;
  subject: string;
  typeKey: string;
  priority: string | null;
  done: boolean;
  dueAtIso: string | null;
  durationMinutes: number | null;
  location: string | null;
  assigneeId: string;
  assigneeName: string;
  ownerName: string;
  dealId: string | null;
  dealTitle: string | null;
  personId: string | null;
  personName: string | null;
  personEmail: string | null;
  personPhone: string | null;
  orgId: string | null;
  orgName: string | null;
}

// Structural contact-point shape (persons.phones jsonb) to avoid a nominal type-import mismatch.
type Point = { value: string; primary?: boolean };

function primaryPoint(points: Point[] | null): string | null {
  if (points === null || points.length === 0) return null;
  return (points.find((p) => p.primary === true) ?? points[0])?.value ?? null;
}

// Map a sort field to its ORDER BY column. subject is NOT NULL; dueAt/priority/duration rely on
// Postgres's default null placement (NULLS LAST on ASC, NULLS FIRST on DESC), which matches the
// brief's "due_at NULLS LAST" default for the (also ASC) fallback sort.
function activitySortColumn(field: ActivitySortField): SQL {
  switch (field) {
    case "subject":
      return sql`${activities.subject}`;
    case "dueAtIso":
      return sql`${activities.dueAt}`;
    case "priority":
      return sql`${activities.priority}`;
    case "duration":
      return sql`${activities.durationMinutes}`;
    default:
      return assertNever(field);
  }
}

// Visible activities enriched with deal/org/contact detail + priority for the Activities table.
// Parent visibility columns are pulled in the same joined query (soft-deleted parents are excluded
// by the join predicate), and parentless-activity participants are fetched in one batched query, so
// visibility resolves in memory (buildActivityVisibility) with no per-row round-trips. This mirrors
// the audited resolver's dominant-parent precedence, so list and calendar never disagree.
// Build the WHERE predicate list from the list filter, always anchored on the not-deleted guard.
// ownerId narrows by assigneeId: Pipedrive's Activities "Owner" filter is really the assigned
// user, not activities.ownerId (which just tracks who created the row).
function activityFilterPredicates(filter: ActivityListFilter): SQL[] {
  const preds: SQL[] = [isNull(activities.deletedAt)];
  if (filter.ownerId !== null) preds.push(eq(activities.assigneeId, filter.ownerId));
  if (filter.done === "open") preds.push(eq(activities.done, false));
  else if (filter.done === "done") preds.push(eq(activities.done, true));
  if (filter.from !== null) preds.push(gte(activities.dueAt, new Date(`${filter.from}T00:00:00`)));
  if (filter.to !== null) preds.push(lte(activities.dueAt, new Date(`${filter.to}T23:59:59`)));
  if (filter.typeKey !== null) preds.push(eq(activityTypes.key, filter.typeKey));
  return preds;
}

export async function listActivityRows(
  db: Db,
  actor: PermSetUser,
  filter: ActivityListFilter,
  signal: AbortSignal,
  sort?: ActivitySort,
): Promise<ActivityTableRow[]> {
  signal.throwIfAborted();
  // No explicit sort: due date ascending (Postgres default places NULLs last on ASC), id as a
  // stable tiebreaker so pagination-free clients still get a deterministic row order.
  const direction = sort === undefined || sort.dir === "asc" ? asc : desc;
  const orderColumn =
    sort === undefined ? sql`${activities.dueAt}` : activitySortColumn(sort.field);
  const rows = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      dueAt: activities.dueAt,
      done: activities.done,
      durationMinutes: activities.durationMinutes,
      location: activities.location,
      assigneeId: activities.assigneeId,
      assigneeName: assigneeUser.name,
      ownerName: ownerUser.name,
      typeKey: activityTypes.key,
      priority: activities.priority,
      dealId: activities.dealId,
      personId: activities.personId,
      orgId: activities.orgId,
      dealTitle: deals.title,
      dealOwnerId: deals.ownerId,
      dealLevel: deals.visibilityLevel,
      dealGroupId: deals.visibilityGroupId,
      dealVisibleTo: deals.visibleToUserIds,
      pipelineVg: pipelines.visibilityGroupId,
      pipelineArchived: pipelines.isArchived,
      personVisibleId: persons.id,
      orgVisibleId: organizations.id,
      personName: persons.name,
      personEmail: persons.primaryEmail,
      personPhones: persons.phones,
      personOwnerId: persons.ownerId,
      personLevel: persons.visibilityLevel,
      personGroupId: persons.visibilityGroupId,
      personVisibleTo: persons.visibleToUserIds,
      orgName: organizations.name,
      orgOwnerId: organizations.ownerId,
      orgLevel: organizations.visibilityLevel,
      orgGroupId: organizations.visibilityGroupId,
      orgVisibleTo: organizations.visibleToUserIds,
    })
    .from(activities)
    .innerJoin(activityTypes, eq(activities.typeId, activityTypes.id))
    .leftJoin(deals, and(eq(deals.id, activities.dealId), isNull(deals.deletedAt)))
    .leftJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .leftJoin(persons, and(eq(persons.id, activities.personId), isNull(persons.deletedAt)))
    .leftJoin(
      organizations,
      and(eq(organizations.id, activities.orgId), isNull(organizations.deletedAt)),
    )
    .leftJoin(assigneeUser, eq(assigneeUser.id, activities.assigneeId))
    .leftJoin(ownerUser, eq(ownerUser.id, activities.ownerId))
    .where(and(...activityFilterPredicates(filter)))
    // Stable server ORDER BY so this pagination-free list is deterministic across calls: the
    // requested (or default due-date) column, then id as a tiebreaker for equal sort keys.
    .orderBy(direction(orderColumn), asc(activities.id));
  signal.throwIfAborted();

  const participantsByActivity = await loadParentlessParticipants(db, rows, signal);

  const out: ActivityTableRow[] = [];
  for (const row of rows) {
    const vis = buildActivityVisibility(row, participantsByActivity.get(row.id) ?? []);
    if (vis === null || !canSee(actor, vis)) continue;
    out.push({
      id: row.id,
      subject: row.subject,
      typeKey: row.typeKey,
      priority: row.priority,
      done: row.done,
      dueAtIso: row.dueAt === null ? null : row.dueAt.toISOString(),
      durationMinutes: row.durationMinutes,
      location: row.location,
      assigneeId: row.assigneeId,
      // Left-joined names can be null (e.g. a since-deleted user); coalesce so the row type
      // stays `string` rather than leaking a nullable join artifact into the table's contract.
      assigneeName: row.assigneeName ?? "",
      ownerName: row.ownerName ?? "",
      dealId: row.dealId,
      dealTitle: row.dealTitle,
      // Link-safe ids from the deletedAt-filtered joins (null when the contact is soft-deleted), so
      // the list never links to a deleted contact's 404 page. Raw row.personId/orgId still gate
      // visibility above via buildActivityVisibility.
      personId: row.personVisibleId,
      personName: row.personName,
      personEmail: row.personEmail,
      personPhone: primaryPoint(row.personPhones),
      orgId: row.orgVisibleId,
      orgName: row.orgName,
    });
  }
  return out;
}
