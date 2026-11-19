import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import {
  actorOf,
  addActivity,
  addDeal,
  addNote,
  addOrg,
  addPerson,
  run,
  seedWorld,
} from "./search.test-helpers";

describe("multi-word queries", () => {
  it("finds a record whose field contains every word in any order", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Acme renewal");
      await addDeal(db, w, "Acme onboarding");
      const r = await run(db, actorOf(w.alice.id), "renewal acme");
      expect(r.deals.map((d) => d.id)).toEqual([deal]);
      expect(r.deals[0]?.match).toBeNull();
    });
  });

  it("matches words across different fields of one record", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const org = await addOrg(db, w, "Acme Corp", { domain: "acme.com" });
      const r = await run(db, actorOf(w.alice.id), "corp acme.com");
      expect(r.organizations.map((o) => o.id)).toEqual([org]);
    });
  });

  it("finds a record through one content item holding every word", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Unrelated");
      await addNote(db, w, "deal", deal, "<p>Please send the signed renewal to Acme today</p>");
      const r = await run(db, actorOf(w.alice.id), "acme renewal");
      expect(r.deals.map((d) => d.id)).toEqual([deal]);
      expect(r.deals[0]?.match).toMatchObject({ source: "note" });
      expect(r.deals[0]?.match?.snippet).toContain("Acme");
    });
  });

  it("does not match when the words are in different notes", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Unrelated");
      await addNote(db, w, "deal", deal, "Acme asked a question");
      await addNote(db, w, "deal", deal, "The renewal is signed");
      const r = await run(db, actorOf(w.alice.id), "acme renewal");
      expect(r.deals).toEqual([]);
    });
  });

  it("does not match when the words are in different activities", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Unrelated");
      await addActivity(db, w, "Acme call", { dealId: deal });
      await addActivity(db, w, "Renewal prep", { dealId: deal });
      const r = await run(db, actorOf(w.alice.id), "acme renewal");
      expect(r.deals).toEqual([]);
    });
  });

  it("searches content when only one of the words is long enough", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const person = await addPerson(db, w, "Unrelated");
      await addNote(db, w, "person", person, "q4 renewal discussed");
      const r = await run(db, actorOf(w.alice.id), "q4 renewal");
      expect(r.people.map((p) => p.id)).toEqual([person]);
    });
  });

  it("does not search content when no word has an alphanumeric run of 3", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const person = await addPerson(db, w, "Unrelated");
      await addNote(db, w, "person", person, "a b c d e f");
      const r = await run(db, actorOf(w.alice.id), "a b");
      expect(r.people).toEqual([]);
    });
  });
});
