import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { BREVO_TIMELINE_LIMIT } from "@/constants/brevo";
import { brevoContactCampaigns } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listMarketingCampaigns } from "./reads";
import {
  actorOf,
  SIG,
  seedCampaign,
  seedContactCampaign,
  seedDeal,
  seedLead,
  seedParticipant,
  seedPerson,
} from "./seed.test-helpers";

const T1 = new Date("2026-10-01T10:00:00Z");
const T2 = new Date("2026-10-02T10:00:00Z");
const T3 = new Date("2026-10-03T10:00:00Z");

describe("listMarketingCampaigns", () => {
  it("returns rows for the person's primary and secondary emails only", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, {
        ownerId: owner.id,
        email: " Pat@Example.com",
        emails: ["alt@example.com"],
      });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 1, sentAt: T1 });
      await seedContactCampaign(db, { email: "alt@example.com", campaignId: 2, sentAt: T2 });
      await seedContactCampaign(db, { email: "other@example.com", campaignId: 3, sentAt: T3 });
      const list = await listMarketingCampaigns(
        db,
        actorOf(owner.id),
        { kind: "person", personId: person },
        SIG(),
      );
      expect(list.items.map((i) => i.campaignId)).toEqual([2, 1]);
      expect(list.items.every((i) => i.recipientPersonId === person)).toBe(true);
      expect(list.truncated).toBe(false);
    });
  });

  it("serves the deal person and participants, each recipient as its own row", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const main = await seedPerson(db, { ownerId: owner.id, email: "main@example.com" });
      const guest = await seedPerson(db, { ownerId: owner.id, email: "guest@example.com" });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: main });
      await seedParticipant(db, deal, guest);
      await seedContactCampaign(db, { email: "main@example.com", campaignId: 1, sentAt: T1 });
      await seedContactCampaign(db, { email: "guest@example.com", campaignId: 1, sentAt: T1 });
      const list = await listMarketingCampaigns(
        db,
        actorOf(owner.id),
        { kind: "deal", dealId: deal },
        SIG(),
      );
      expect(list.items.map((i) => i.recipientEmail)).toEqual([
        "guest@example.com",
        "main@example.com",
      ]);
    });
  });

  it("serves the lead person and respects lead visibility", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      const privateLead = await seedLead(db, {
        ownerId: owner.id,
        personId: person,
        level: "owner",
      });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 1, sentAt: T1 });
      const scope = { kind: "lead", leadId: privateLead } as const;
      expect(
        (await listMarketingCampaigns(db, actorOf(owner.id), scope, SIG())).items,
      ).toHaveLength(1);
      expect((await listMarketingCampaigns(db, actorOf(viewer.id), scope, SIG())).items).toEqual(
        [],
      );
    });
  });

  it("returns nothing for a deal or person the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: person, level: "owner" });
      const hidden = await seedPerson(db, {
        ownerId: owner.id,
        email: "hidden@example.com",
        level: "owner",
      });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 1, sentAt: T1 });
      await seedContactCampaign(db, { email: "hidden@example.com", campaignId: 1, sentAt: T1 });
      const viewerActor = actorOf(viewer.id);
      expect(
        (await listMarketingCampaigns(db, viewerActor, { kind: "deal", dealId: deal }, SIG()))
          .items,
      ).toEqual([]);
      expect(
        (await listMarketingCampaigns(db, viewerActor, { kind: "person", personId: hidden }, SIG()))
          .items,
      ).toEqual([]);
    });
  });

  it("ignores deleted persons and noreply addresses", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const robot = await seedPerson(db, { ownerId: owner.id, email: "no-reply@example.com" });
      const gone = await seedPerson(db, { ownerId: owner.id, email: "gone@example.com" });
      await db.execute(sql`UPDATE persons SET deleted_at = now() WHERE id = ${gone}`);
      await seedContactCampaign(db, { email: "no-reply@example.com", campaignId: 1, sentAt: T1 });
      await seedContactCampaign(db, { email: "gone@example.com", campaignId: 1, sentAt: T1 });
      const actor = actorOf(owner.id);
      for (const personId of [robot, gone]) {
        expect(
          (await listMarketingCampaigns(db, actor, { kind: "person", personId }, SIG())).items,
        ).toEqual([]);
      }
    });
  });

  it("falls back to Campaign #id when the catalog lacks the campaign and uses catalog fields otherwise", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      await seedCampaign(db, { id: 1, name: "Launch", subject: "Big news" });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 1, sentAt: T2 });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 2, sentAt: T1 });
      const list = await listMarketingCampaigns(
        db,
        actorOf(owner.id),
        { kind: "person", personId: person },
        SIG(),
      );
      expect(list.items.map((i) => [i.campaignName, i.subject])).toEqual([
        ["Launch", "Big news"],
        ["Campaign #2", null],
      ]);
    });
  });

  it("orders by the sent time, then the catalog time, then the earliest event", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      await seedCampaign(db, { id: 2, sentAt: T2 });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 1, sentAt: T1 });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 2 });
      await seedContactCampaign(db, {
        email: "pat@example.com",
        campaignId: 3,
        firstOpenedAt: T3,
        firstClickedAt: new Date("2026-10-04T10:00:00Z"),
      });
      const list = await listMarketingCampaigns(
        db,
        actorOf(owner.id),
        { kind: "person", personId: person },
        SIG(),
      );
      expect(list.items.map((i) => [i.campaignId, i.at])).toEqual([
        [3, T3.toISOString()],
        [2, T2.toISOString()],
        [1, T1.toISOString()],
      ]);
    });
  });

  it("does not move a row when it is synced again", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 1, firstOpenedAt: T1 });
      const scope = { kind: "person", personId: person } as const;
      const before = await listMarketingCampaigns(db, actorOf(owner.id), scope, SIG());
      await db.update(brevoContactCampaigns).set({ updatedAt: new Date("2030-01-01T00:00:00Z") });
      const after = await listMarketingCampaigns(db, actorOf(owner.id), scope, SIG());
      expect(after.items[0]?.at).toBe(before.items[0]?.at);
      expect(after.items[0]?.at).toBe(T1.toISOString());
    });
  });

  it("reports every status timestamp and the clicked urls", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      await seedContactCampaign(db, {
        email: "pat@example.com",
        campaignId: 1,
        sentAt: T1,
        deliveredAt: T1,
        firstOpenedAt: T2,
        firstClickedAt: T3,
        clickedUrls: ["https://a.test"],
        softBouncedAt: T1,
        hardBouncedAt: T2,
        complainedAt: T3,
        unsubscribedAt: T3,
      });
      const [item] = (
        await listMarketingCampaigns(
          db,
          actorOf(owner.id),
          { kind: "person", personId: person },
          SIG(),
        )
      ).items;
      expect(item).toMatchObject({
        campaignId: 1,
        recipientEmail: "pat@example.com",
        clickedUrls: ["https://a.test"],
        deliveredAt: T1.toISOString(),
        firstOpenedAt: T2.toISOString(),
        firstClickedAt: T3.toISOString(),
        softBouncedAt: T1.toISOString(),
        hardBouncedAt: T2.toISOString(),
        complainedAt: T3.toISOString(),
        unsubscribedAt: T3.toISOString(),
      });
    });
  });

  it("caps the list and sets truncated when more rows exist", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      const total = BREVO_TIMELINE_LIMIT + 3;
      await db.insert(brevoContactCampaigns).values(
        Array.from({ length: total }, (_, i) => ({
          email: "pat@example.com",
          campaignId: i + 1,
          sentAt: new Date(T1.getTime() + i * 60_000),
        })),
      );
      const list = await listMarketingCampaigns(
        db,
        actorOf(owner.id),
        { kind: "person", personId: person },
        SIG(),
      );
      expect(list.items).toHaveLength(BREVO_TIMELINE_LIMIT);
      expect(list.truncated).toBe(true);
      expect(list.items[0]?.campaignId).toBe(total);
    });
  });
});
