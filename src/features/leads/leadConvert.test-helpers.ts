import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { leads } from "@/db/schema/leads";
import { settings } from "@/db/schema/system";
import type { withTestDb } from "@/db/testing";
import type { LeadSession } from "./leadActions";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

export function session(userId: string, extra: Partial<LeadSession> = {}): LeadSession {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
    managedUserIds: [] as string[],
    primaryVisibilityGroupId: null,
    flags: { "deal.create": true },
    ...extra,
  };
}

export async function seedSettings(
  db: TestDb,
  overrides: Partial<typeof settings.$inferInsert> = {},
): Promise<void> {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
    ...overrides,
  });
}

export async function insertLead(
  db: TestDb,
  ownerId: string,
  overrides: Partial<typeof leads.$inferInsert> = {},
): Promise<typeof leads.$inferSelect> {
  const [row] = await db
    .insert(leads)
    .values({ title: "Acme lead", ownerId, visibilityLevel: "all", ...overrides })
    .returning();
  if (row === undefined) {
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "insertLead: insert returned no rows");
  }
  return row;
}

export const sig = (): AbortSignal => new AbortController().signal;
