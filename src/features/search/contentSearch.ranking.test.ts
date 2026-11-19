import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { actorOf, addActivity, addDeal, addNote, run, seedWorld } from "./search.test-helpers";

describe("ranking", () => {
  it("ranks a field match above a content match", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const viaNote = await addDeal(db, w, "Zzz first alphabetically");
      await addNote(db, w, "deal", viaNote, "rankterm here");
      const viaField = await addDeal(db, w, "Zeta rankterm");
      const r = await run(db, actorOf(w.alice.id), "rankterm");
      expect(r.deals.map((x) => x.id)).toEqual([viaField, viaNote]);
      expect(r.deals[0]?.match).toBeNull();
    });
  });

  it("ranks a prefix field match above a mid-string match, then alphabetical", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const mid = await addDeal(db, w, "A prefixterm mid");
      const b = await addDeal(db, w, "prefixterm B");
      const a = await addDeal(db, w, "prefixterm A");
      const r = await run(db, actorOf(w.alice.id), "prefixterm");
      expect(r.deals.map((x) => x.id)).toEqual([a, b, mid]);
    });
  });

  it("orders content hits by the most recent matching item", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const older = await addDeal(db, w, "Older");
      const newer = await addDeal(db, w, "Newer");
      await addNote(db, w, "deal", older, "recencyterm", { createdAt: new Date("2026-01-01") });
      await addNote(db, w, "deal", newer, "recencyterm", { createdAt: new Date("2026-06-01") });
      const r = await run(db, actorOf(w.alice.id), "recencyterm");
      expect(r.deals.map((x) => x.id)).toEqual([newer, older]);
    });
  });

  it("lists a record found through two sources once, with the newer snippet", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Title");
      await addNote(db, w, "deal", deal, "oldnote twosourceterm", {
        createdAt: new Date("2026-01-01"),
      });
      await addActivity(db, w, "newer activity twosourceterm", {
        dealId: deal,
        dueAt: new Date("2026-06-01"),
      });
      const r = await run(db, actorOf(w.alice.id), "twosourceterm");
      expect(r.deals).toHaveLength(1);
      expect(r.deals[0]?.match?.source).toBe("activity");
    });
  });

  it("caps each section at eight results", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      for (let i = 0; i < 10; i += 1) await addDeal(db, w, `captermdeal ${i}`);
      const r = await run(db, actorOf(w.alice.id), "captermdeal");
      expect(r.deals).toHaveLength(8);
    });
  });
});
