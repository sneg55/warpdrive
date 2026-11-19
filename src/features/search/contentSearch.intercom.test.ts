import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals, intercomConversationParts, intercomConversations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import {
  addParticipantRow,
  conversationFor,
  linkedDeal,
  MAYA_EMAIL,
  removeParticipantRow,
  setContactEmail,
} from "@/features/intercom/dealSearch/dealSearch.test-helpers";
import { refreshDealIntercomSearch } from "@/features/intercom/dealSearch/refresh";
import { actorOf, addDeal, addNote, run, seedWorld, type TestDb } from "./search.test-helpers";

const signal = () => new AbortController().signal;
const refresh = (db: TestDb, ...ids: string[]) => refreshDealIntercomSearch(db, ids, signal());
const found = async (db: TestDb, userId: string, q: string) =>
  (await run(db, actorOf(userId), q)).deals;

describe("deal search through Intercom", () => {
  it("finds the deal by a code that is only in its conversation", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, {
        title: "Affiliate",
        parts: [{ id: "p1", partType: "comment", body: "<p>code PROPDESK in our dashboard</p>" }],
      });
      await refresh(db, dealId);
      const hit = (await found(db, w.alice.id, "PROPDESK")).find((d) => d.id === dealId);
      expect(hit?.match).toMatchObject({ source: "intercom", label: "Intercom" });
      expect(hit?.match?.snippet).toContain("PROPDESK");
    });
  });

  it("finds the deal by a conversation title", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Zebra payout question" });
      await refresh(db, dealId);
      const hit = (await found(db, w.alice.id, "zebra")).find((d) => d.id === dealId);
      expect(hit?.match?.source).toBe("intercom");
    });
  });

  it("never matches a conversation with no messages, even by title", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Zebra payout" });
      await refresh(db, dealId);
      expect(await found(db, w.alice.id, "zebra")).toHaveLength(1);
      await db.update(intercomConversations).set({ messageCount: 0 });
      expect(await found(db, w.alice.id, "zebra")).toEqual([]);
    });
  });

  it("matches multi-word queries only within one part", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, {
        parts: [
          { id: "p1", partType: "comment", body: "<p>zebra stripes</p>" },
          { id: "p2", partType: "comment", body: "<p>payout schedule</p>" },
          { id: "p3", partType: "comment", body: "<p>zebra payout</p>" },
        ],
      });
      await refresh(db, dealId);
      expect(await found(db, w.alice.id, "stripes schedule")).toEqual([]);
      expect(await found(db, w.alice.id, "payout zebra")).toHaveLength(1);
    });
  });

  it("does not surface a deal through a participant the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w, "lead@acme.com");
      const hidden = await linkedDeal(db, w, "hidden@acme.com", {
        visibility: "owner",
        ownerId: w.bob.id,
      });
      await addParticipantRow(db, dealId, hidden.personId);
      await conversationFor(db, "c1", "hidden@acme.com", { title: "Zebra secret" });
      await conversationFor(db, "c2", "lead@acme.com", { title: "Giraffe public" });
      await refresh(db, dealId);
      expect(await found(db, w.alice.id, "zebra")).toEqual([]);
      expect((await found(db, w.alice.id, "giraffe")).map((d) => d.id)).toContain(dealId);
      expect((await found(db, w.bob.id, "zebra")).map((d) => d.id)).toContain(dealId);
    });
  });

  it("does not surface a deal the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await db
        .update(deals)
        .set({ visibilityLevel: "owner", ownerId: w.bob.id })
        .where(eq(deals.id, dealId));
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Zebra payout" });
      await refresh(db, dealId);
      expect(await found(db, w.alice.id, "zebra")).toEqual([]);
    });
  });
});

describe("Intercom freshness", () => {
  it("stops matching at once when the participant is removed", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w, "lead@acme.com");
      const other = await linkedDeal(db, w, "other@acme.com");
      await addParticipantRow(db, dealId, other.personId);
      await conversationFor(db, "c1", "other@acme.com", { title: "Zebra" });
      await refresh(db, dealId);
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).toContain(dealId);
      await removeParticipantRow(db, dealId, other.personId);
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).not.toContain(dealId);
    });
  });

  it("stops matching at once when the deal person changes", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      const other = await linkedDeal(db, w, "other@acme.com");
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Zebra" });
      await refresh(db, dealId);
      await db.update(deals).set({ personId: other.personId }).where(eq(deals.id, dealId));
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).not.toContain(dealId);
    });
  });

  it("stops matching at once when the person's email changes", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId, personId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Zebra" });
      await refresh(db, dealId);
      await db
        .update(persons)
        .set({ primaryEmail: "new@acme.com" })
        .where(eq(persons.id, personId));
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).not.toContain(dealId);
    });
  });

  it("stops matching at once when the Intercom contact email changes", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Zebra" });
      await refresh(db, dealId);
      await setContactEmail(db, "c1-k0", "moved@acme.com");
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).not.toContain(dealId);
    });
  });

  it("stops matching at once when the deal is deleted", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Zebra" });
      await refresh(db, dealId);
      await db.update(deals).set({ deletedAt: new Date() }).where(eq(deals.id, dealId));
      expect(await found(db, w.alice.id, "zebra")).toEqual([]);
    });
  });

  it("matches an added participant only after the job runs", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w, "lead@acme.com");
      const other = await linkedDeal(db, w, "other@acme.com");
      await conversationFor(db, "c1", "other@acme.com", { title: "Zebra" });
      await refresh(db, dealId);
      await addParticipantRow(db, dealId, other.personId);
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).not.toContain(dealId);
      await refresh(db, dealId);
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).toContain(dealId);
    });
  });

  it("matches an added email only after the job runs", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId, personId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", "alias@acme.com", { title: "Zebra" });
      await refresh(db, dealId);
      await db
        .update(persons)
        .set({ emails: [{ label: "work", value: "alias@acme.com" }] })
        .where(eq(persons.id, personId));
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).not.toContain(dealId);
      await refresh(db, dealId);
      expect((await found(db, w.alice.id, "zebra")).map((d) => d.id)).toContain(dealId);
    });
  });

  it("matches a newly synced part only after the job runs", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Hello" });
      await refresh(db, dealId);
      await db.insert(intercomConversationParts).values({
        id: "late",
        conversationId: "c1",
        partType: "comment",
        bodyHtml: "<p>zebra arrived</p>",
        createdAt: new Date(),
      });
      expect(await found(db, w.alice.id, "zebra")).toEqual([]);
      await refresh(db, dealId);
      expect(await found(db, w.alice.id, "zebra")).toHaveLength(1);
    });
  });
});

describe("Intercom ranking", () => {
  it("ranks by the old matching part when a newer part does not match", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const intercomDeal = await linkedDeal(db, w);
      const noteDeal = await addDeal(db, w, "Note deal");
      await conversationFor(db, "c1", MAYA_EMAIL, {
        parts: [
          { id: "old", partType: "comment", body: "<p>zebra stripes</p>" },
          { id: "new", partType: "comment", body: "<p>nothing relevant</p>" },
        ],
      });
      await db
        .update(intercomConversationParts)
        .set({ createdAt: new Date("2026-01-01T00:00:00Z") })
        .where(eq(intercomConversationParts.id, "old"));
      await db
        .update(intercomConversationParts)
        .set({ createdAt: new Date("2026-03-01T00:00:00Z") })
        .where(eq(intercomConversationParts.id, "new"));
      await db.update(intercomConversations).set({ lastPartAt: new Date("2026-03-01T00:00:00Z") });
      await addNote(db, w, "deal", noteDeal, "zebra note", {
        createdAt: new Date("2026-02-01T00:00:00Z"),
      });
      await refresh(db, intercomDeal.dealId);
      const ids = (await found(db, w.alice.id, "zebra")).map((d) => d.id);
      expect(ids).toEqual([noteDeal, intercomDeal.dealId]);
    });
  });
});
