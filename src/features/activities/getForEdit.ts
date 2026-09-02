import { and, eq, isNull } from "drizzle-orm";
import { ACTIVITY_PRIORITIES, isActivityPriorityKey } from "@/constants/activityPriorities";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  activities,
  activityGuests,
  activityParticipants,
  deals,
  organizations,
  persons,
} from "@/db/schema";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";
import { linkedParentVisible } from "./parentLinkVisibility";
import { resolveActivityVisibility } from "./visibility";

// Every field the inline composer needs to prefill an edit. Timestamps are ISO strings so the
// client can split them into its local date/time inputs without a serialization round-trip issue.
export interface EditableActivity {
  id: string;
  typeId: string;
  subject: string;
  priority: string | null;
  dueAt: string | null;
  // The user set a day but no time; the composer must not echo the stored midnight back.
  allDay: boolean;
  endAt: string | null;
  durationMinutes: number | null;
  location: string | null;
  note: string | null;
  videoCallUrl: string | null;
  assigneeId: string;
  done: boolean;
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  guestPersonIds: string[];
  participantUserIds: string[];
  dealTitle: string | null;
  personName: string | null;
  orgName: string | null;
}

type LinkNames = Pick<EditableActivity, "dealTitle" | "personName" | "orgName">;

async function visibleLinkedName(
  db: DbOrTx,
  actor: PermSetUser,
  kind: "person" | "organization",
  id: string | null,
): Promise<string | null> {
  if (id === null) return null;
  const table = kind === "person" ? persons : organizations;
  const [row] = await db
    .select({
      id: table.id,
      name: table.name,
      ownerId: table.ownerId,
      level: table.visibilityLevel,
      groupId: table.visibilityGroupId,
      visibleTo: table.visibleToUserIds,
    })
    .from(table)
    .where(and(eq(table.id, id), isNull(table.deletedAt)));
  if (row === undefined) return null;
  return linkedParentVisible(actor, kind, row.id, row) ? row.name : null;
}

async function dealTitleOf(db: DbOrTx, dealId: string | null): Promise<string | null> {
  if (dealId === null) return null;
  const [deal] = await db
    .select({ title: deals.title })
    .from(deals)
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt)));
  return deal?.title ?? null;
}

async function linkNames(
  db: DbOrTx,
  actor: PermSetUser,
  links: { dealId: string | null; personId: string | null; orgId: string | null },
  signal: AbortSignal,
): Promise<LinkNames> {
  signal.throwIfAborted();
  const [dealTitle, personName, orgName] = await Promise.all([
    dealTitleOf(db, links.dealId),
    visibleLinkedName(db, actor, "person", links.personId),
    visibleLinkedName(db, actor, "organization", links.orgId),
  ]);
  signal.throwIfAborted();
  return { dealTitle, personName, orgName };
}

// Coerce a stored priority to a valid key so the edit round-trips through the update schema's enum.
// Real (app-created) activities already store a key; legacy/seed rows that stored the display NAME
// ("Low") are mapped back to the key ("low"), and anything unrecognized becomes null (unset).
function normalizePriority(p: string | null): string | null {
  if (p === null) return null;
  if (isActivityPriorityKey(p)) return p;
  const byName = Object.entries(ACTIVITY_PRIORITIES).find(
    ([, v]) => v.name.toLowerCase() === p.toLowerCase(),
  );
  return byName?.[0] ?? null;
}

// Loads one activity with its guest + participant sets for the edit composer. Visibility-gated:
// returns ACTIVITY_NOT_FOUND (never 403) when the activity is missing or invisible to the actor,
// matching updateActivity's 404-on-invisible behavior.
export async function getActivityForEdit(
  db: DbOrTx,
  actor: PermSetUser,
  id: string,
  signal: AbortSignal,
): Promise<Result<EditableActivity, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), isNull(activities.deletedAt)));
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity not found", { id }));
  }

  const vis = await resolveActivityVisibility(db, row, signal);
  if (vis === null || !canSee(actor, vis)) {
    return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity not found", { id }));
  }

  const guests = await db
    .select({ personId: activityGuests.personId })
    .from(activityGuests)
    .where(eq(activityGuests.activityId, id));
  const participants = await db
    .select({ userId: activityParticipants.userId })
    .from(activityParticipants)
    .where(eq(activityParticipants.activityId, id));
  const names = await linkNames(db, actor, row, signal);

  return ok({
    ...names,
    id: row.id,
    typeId: row.typeId,
    subject: row.subject,
    priority: normalizePriority(row.priority),
    dueAt: row.dueAt?.toISOString() ?? null,
    allDay: row.allDay,
    endAt: row.endAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes,
    location: row.location,
    note: row.note,
    videoCallUrl: row.videoCallUrl,
    assigneeId: row.assigneeId,
    done: row.done,
    dealId: row.dealId,
    personId: row.personId,
    orgId: row.orgId,
    guestPersonIds: guests.map((g) => g.personId),
    participantUserIds: participants.map((p) => p.userId),
  });
}
