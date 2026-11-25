import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { makeBrevoRouter } from "./router";
import { actorOf, seedContactCampaign, seedDeal, seedLead, seedPerson } from "./seed.test-helpers";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

function callerFor(db: TestDb, userId: string, enabled: boolean) {
  const actor = actorOf(userId);
  return makeBrevoRouter(() => enabled).createCaller({
    db,
    session: { userId, sessionId: "test-session" },
    actor: { ...actor, name: "Test User", email: "test@example.com", avatarUrl: null },
  });
}

async function seedWorld(db: TestDb) {
  const owner = await seedUser(db);
  const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
  const deal = await seedDeal(db, { ownerId: owner.id, personId: person });
  const lead = await seedLead(db, { ownerId: owner.id, personId: person });
  await seedContactCampaign(db, {
    email: "pat@example.com",
    campaignId: 1,
    sentAt: new Date("2026-10-01T10:00:00Z"),
  });
  return { owner, person, deal, lead };
}

describe("brevo router", () => {
  it("returns nothing on every surface when the integration is off", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const caller = callerFor(db, w.owner.id, false);
      const empty = { items: [], truncated: false };
      expect(await caller.list({ scope: { kind: "person", personId: w.person } })).toEqual(empty);
      expect(await caller.list({ scope: { kind: "deal", dealId: w.deal } })).toEqual(empty);
      expect(await caller.list({ scope: { kind: "lead", leadId: w.lead } })).toEqual(empty);
    });
  });

  it("serves the person, deal and lead surfaces when on", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const caller = callerFor(db, w.owner.id, true);
      for (const scope of [
        { kind: "person", personId: w.person },
        { kind: "deal", dealId: w.deal },
        { kind: "lead", leadId: w.lead },
      ] as const) {
        const list = await caller.list({ scope });
        expect(list.items.map((i) => i.campaignId)).toEqual([1]);
      }
    });
  });

  it("rejects a scope with a malformed id", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const caller = callerFor(db, w.owner.id, true);
      await expect(caller.list({ scope: { kind: "deal", dealId: "nope" } })).rejects.toThrow();
    });
  });
});
