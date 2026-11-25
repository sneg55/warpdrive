import { eq } from "drizzle-orm";
import { brevoTrackedEmails } from "@/db/schema";
import type { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { FakeEmailBehavior } from "./brevoFake.test-helpers";
import { seedDeal, seedPerson } from "./seed.test-helpers";

export const START_MS = Date.parse("2026-11-25T12:00:00Z");
export const TODAY = "2026-11-25";
export const YESTERDAY = "2026-11-24";
export const HOUR_MS = 3_600_000;

export type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

export function clock() {
  const state = { ms: START_MS };
  return { state, nowMs: () => state.ms };
}

export const deliveredIn: Extract<FakeEmailBehavior, { kind: "stats" }> = {
  kind: "stats",
  stats: (w) => ({
    delivered: [
      {
        campaignId: Number(w.startDate.replaceAll("-", "")),
        eventTime: `${w.startDate}T10:00:00.000Z`,
      },
    ],
  }),
};

export async function linkEmails(db: TestDb, emails: string[]): Promise<void> {
  const owner = await seedUser(db);
  for (const email of emails) {
    const person = await seedPerson(db, { ownerId: owner.id, email });
    await seedDeal(db, { ownerId: owner.id, personId: person });
  }
}

export async function trackedRow(db: TestDb, email: string) {
  const [row] = await db
    .select()
    .from(brevoTrackedEmails)
    .where(eq(brevoTrackedEmails.email, email));
  return row;
}

export const signal = (): AbortSignal => new AbortController().signal;
