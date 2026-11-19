import { and, eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { vi } from "vitest";
import { PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH } from "@/constants/jobNames";
import { dealIntercomSearch, dealParticipants, deals, intercomContacts } from "@/db/schema";
import { addDeal, addPerson, type TestDb, type World } from "@/features/search/search.test-helpers";
import { setBoss } from "@/jobs/boss";
import { type SeedConversation, seedConversation } from "../seed.test-helpers";

export const MAYA_EMAIL = "affiliate@propdesknews.com";

export interface LinkedDeal {
  dealId: string;
  personId: string;
}

export async function linkedDeal(
  db: TestDb,
  w: World,
  email = MAYA_EMAIL,
  personOpts: { visibility?: "all" | "owner"; ownerId?: string } = {},
): Promise<LinkedDeal> {
  const personId = await addPerson(db, w, "Maya (Prop Desk)", { email, ...personOpts });
  const dealId = await addDeal(db, w, "Maya (Prop Desk)");
  await db.update(deals).set({ personId }).where(eq(deals.id, dealId));
  return { dealId, personId };
}

export async function addParticipantRow(
  db: TestDb,
  dealId: string,
  personId: string,
): Promise<void> {
  await db.insert(dealParticipants).values({ dealId, personId });
}

export async function removeParticipantRow(
  db: TestDb,
  dealId: string,
  personId: string,
): Promise<void> {
  await db
    .delete(dealParticipants)
    .where(and(eq(dealParticipants.dealId, dealId), eq(dealParticipants.personId, personId)));
}

export async function conversationFor(
  db: TestDb,
  id: string,
  email: string | null,
  extra: Partial<SeedConversation> = {},
): Promise<void> {
  await seedConversation(db, { id, contactEmails: [email], ...extra });
}

export async function setContactEmail(
  db: TestDb,
  contactId: string,
  email: string | null,
): Promise<void> {
  await db.update(intercomContacts).set({ email }).where(eq(intercomContacts.id, contactId));
}

export async function searchRows(db: TestDb, dealId: string) {
  return db.select().from(dealIntercomSearch).where(eq(dealIntercomSearch.dealId, dealId));
}

type Send = (name: string, data: unknown, options: unknown) => Promise<string | null>;

export function captureDealSearchQueue() {
  const send = vi.fn<Send>(() => Promise.resolve("job"));
  setBoss({ send } as unknown as PgBoss);
  return {
    queued: (): string[] => [
      ...new Set(
        send.mock.calls
          .filter((c) => c[0] === PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH)
          .map((c) => (c[1] as { dealId: string }).dealId),
      ),
    ],
    reset: () => send.mockClear(),
    release: () => setBoss(null as unknown as PgBoss),
  };
}
