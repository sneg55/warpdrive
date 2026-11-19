import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import {
  actorOf,
  addActivity,
  addDeal,
  addLead,
  addNote,
  addOrg,
  addPerson,
  run,
  seedWorld,
} from "./search.test-helpers";

describe("the Maya cases", () => {
  it("finds the person and the deal for a code that is only in attached content", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const person = await addPerson(db, w, "Maya (Prop Desk)", {
        email: "affiliate@propdesknews.com",
      });
      const deal = await addDeal(db, w, "Maya (Prop Desk)");
      await addActivity(db, w, "Call", {
        dealId: deal,
        note: "<p>code PROPDESK in our affiliate dashboard</p>",
      });
      const r = await run(db, actorOf(w.alice.id), "PROPDESK");

      const p = r.people.find((x) => x.id === person);
      expect(p?.match).toBeNull();
      const d = r.deals.find((x) => x.id === deal);
      expect(d?.match).toMatchObject({ source: "activity", label: "Activity" });
      expect(d?.match?.snippet).toContain("PROPDESK");
    });
  });

  it("finds the person by the email domain with no match line", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const person = await addPerson(db, w, "Maya (Prop Desk)", {
        email: "affiliate@propdesknews.com",
      });
      for (const q of ["propdesknews.com", "propdesk"]) {
        const hit = (await run(db, actorOf(w.alice.id), q)).people.find((x) => x.id === person);
        expect(hit?.match).toBeNull();
      }
    });
  });

  it("finds Maya by a partial prefix", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Maya (Prop Desk)");
      const r = await run(db, actorOf(w.alice.id), "pro");
      expect(r.deals.map((x) => x.id)).toContain(deal);
    });
  });
});

describe("matching rules", () => {
  it("treats percent and underscore literally", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const literal = await addDeal(db, w, "Discount 50% off");
      const other = await addDeal(db, w, "Discount 50 percent");
      const under = await addDeal(db, w, "snake_case deal");
      const plain = await addDeal(db, w, "snakeXcase deal");
      const a = actorOf(w.alice.id);
      const pct = (await run(db, a, "50%")).deals.map((x) => x.id);
      expect(pct).toContain(literal);
      expect(pct).not.toContain(other);
      const us = (await run(db, a, "snake_case")).deals.map((x) => x.id);
      expect(us).toContain(under);
      expect(us).not.toContain(plain);
    });
  });

  it("searches no content without an alphanumeric run of 3, but still matches fields", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Title");
      await addNote(db, w, "deal", deal, "xy___ note body ab");
      const a = actorOf(w.alice.id);
      expect((await run(db, a, "___")).deals).toHaveLength(0);
      expect((await run(db, a, "ab")).deals).toHaveLength(0);
      const field = await addDeal(db, w, "ab field");
      expect((await run(db, a, "ab")).deals.map((x) => x.id)).toEqual([field]);
    });
  });

  it("does not match markup, and matches a decoded entity", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Title");
      await addNote(db, w, "deal", deal, '<div class="x">R&amp;D budget</div>');
      const a = actorOf(w.alice.id);
      expect((await run(db, a, "div")).deals).toHaveLength(0);
      expect((await run(db, a, "class")).deals).toHaveLength(0);
      expect((await run(db, a, "R&D budget")).deals.map((x) => x.id)).toEqual([deal]);
    });
  });

  it("excludes soft-deleted notes, deleted records and archived leads", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Title");
      await addNote(db, w, "deal", deal, "deletednoteterm", { deleted: true });
      const lead = await addLead(db, w, "Archived", { archived: true });
      await addNote(db, w, "lead", lead, "archivedleadterm");
      const person = await addPerson(db, w, "Gone");
      await addNote(db, w, "person", person, "deletedpersonterm");
      await db.execute(
        (await import("drizzle-orm"))
          .sql`UPDATE persons SET deleted_at = now() WHERE id = ${person}`,
      );
      const a = actorOf(w.alice.id);
      expect((await run(db, a, "deletednoteterm")).deals).toHaveLength(0);
      expect((await run(db, a, "archivedleadterm")).leads).toHaveLength(0);
      expect((await run(db, a, "deletedpersonterm")).people).toHaveLength(0);
    });
  });

  it("keeps the domain behaviour for a url query", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const org = await addOrg(db, w, "Pioneer Valley Transit", { domain: "pvta.com" });
      const r = await run(db, actorOf(w.alice.id), "https://www.PVTA.com/");
      expect(r.organizations.map((x) => x.id)).toContain(org);
    });
  });
});
