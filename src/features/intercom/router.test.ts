import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { makeIntercomRouter } from "./router";
import { actorOf, seedConversation, seedDeal, seedLead, seedPerson } from "./seed.test-helpers";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

function callerFor(db: TestDb, userId: string, enabled: boolean) {
  const actor = actorOf(userId);
  return makeIntercomRouter(() => enabled).createCaller({
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
  await seedConversation(db, {
    id: "c1",
    contactEmails: ["pat@example.com"],
    parts: [
      { id: "source-c1", partType: "source" },
      { id: "n1", partType: "note", body: "<p>internal note</p>" },
    ],
  });
  return { owner, person, deal, lead };
}

describe("intercom router", () => {
  it("returns nothing on every surface when the integration is off", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const caller = callerFor(db, w.owner.id, false);
      expect(await caller.list({ scope: { kind: "person", personId: w.person } })).toEqual([]);
      expect(await caller.list({ scope: { kind: "deal", dealId: w.deal } })).toEqual([]);
      expect(await caller.list({ scope: { kind: "lead", leadId: w.lead } })).toEqual([]);
      expect(
        await caller.parts({ conversationId: "c1", scope: { kind: "deal", dealId: w.deal } }),
      ).toEqual([]);
    });
  });

  it("serves the person, deal and lead surfaces when on, without internal notes", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const caller = callerFor(db, w.owner.id, true);
      expect(
        (await caller.list({ scope: { kind: "person", personId: w.person } })).map((c) => c.id),
      ).toEqual(["c1"]);
      expect(
        (await caller.list({ scope: { kind: "deal", dealId: w.deal } })).map((c) => c.id),
      ).toEqual(["c1"]);
      expect(
        (await caller.list({ scope: { kind: "lead", leadId: w.lead } })).map((c) => c.id),
      ).toEqual(["c1"]);
      const parts = await caller.parts({
        conversationId: "c1",
        scope: { kind: "deal", dealId: w.deal },
      });
      expect(parts.map((p) => p.id)).toEqual(["source-c1"]);
      expect(JSON.stringify(parts)).not.toContain("internal note");
    });
  });

  it("answers a hidden conversation with not found", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const stranger = await seedUser(db);
      await seedConversation(db, { id: "c2", contactEmails: ["nobody@example.com"] });
      await expect(
        callerFor(db, stranger.id, true).parts({
          conversationId: "c2",
          scope: { kind: "person", personId: w.person },
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
