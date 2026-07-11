import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { activityTypes } from "@/db/schema";
import type { withTestDb } from "@/db/testing";
import type { PermSetUser } from "@/features/permissions/effective";
import type { ActivityCreateInput, ActivityListFilter } from "./schemas";

// Shared fixtures for activityRows.*.test.ts: a minimal actor, an always-fresh AbortSignal,
// the seeded "call" activity type id, and a builder for the fields every listActivityRows
// ordering test needs but doesn't vary (no parent, no participants).

export function actor(id: string, isAdmin = false): PermSetUser {
  return {
    id,
    type: isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
}

export const sig = (): AbortSignal => new AbortController().signal;

// "all" (no done/date/owner narrowing): the neutral filter for tests written before Task 7 added
// the filter param, so they keep exercising unfiltered listing/ordering behavior unchanged.
export const noFilter: ActivityListFilter = {
  ownerId: null,
  done: "all",
  from: null,
  to: null,
  typeKey: null,
};

export async function callTypeId(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
): Promise<string> {
  const [t] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (t === undefined) {
    throw new AppError(ERROR_IDS.DB_INVARIANT, "activity type 'call' not seeded");
  }
  return t.id;
}

export function minimalActivityInput(
  typeId: string,
  subject: string,
  overrides: {
    dueAt?: string | null;
    priority?: string | null;
    durationMinutes?: number | null;
  } = {},
): ActivityCreateInput {
  return {
    typeId,
    subject,
    dueAt: overrides.dueAt ?? null,
    priority: overrides.priority ?? null,
    durationMinutes: overrides.durationMinutes ?? null,
    dealId: null,
    personId: null,
    orgId: null,
    guestPersonIds: [],
    participantUserIds: [],
    customFields: {},
  };
}
