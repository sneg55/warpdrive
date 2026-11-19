import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withTestDb } from "@/db/testing";
import {
  actorOf,
  addActivity,
  addDeal,
  addPerson,
  run,
  seedWorld,
  type TestDb,
} from "./search.test-helpers";

type FieldType = (typeof schema.customFieldDefs.$inferInsert)["type"];

async function def(
  db: TestDb,
  key: string,
  type: FieldType,
  o: {
    target?: "deal" | "person" | "activity";
    name?: string;
    options?: Array<{ id: string; label: string }>;
    archived?: boolean;
  } = {},
) {
  await db.insert(schema.customFieldDefs).values({
    targetEntity: o.target ?? "deal",
    type,
    name: o.name ?? `Field ${key}`,
    key,
    options: o.options ?? [],
    archivedAt: o.archived === true ? new Date() : null,
  });
}

describe("custom field source", () => {
  it("finds a record through a text value and names the field", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await def(db, "ref", "text", { name: "Referral code" });
      const deal = await addDeal(db, w, "Title", { customFields: { ref: "cftextterm-77" } });
      const r = await run(db, actorOf(w.alice.id), "cftextterm");
      expect(r.deals[0]?.id).toBe(deal);
      expect(r.deals[0]?.match).toMatchObject({
        source: "custom_field",
        label: "Referral code",
        snippet: "cftextterm-77",
      });
    });
  });

  it("matches an address subfield", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await def(db, "addr", "address", { target: "person" });
      const person = await addPerson(db, w, "Name", {
        customFields: { addr: { street: "1 Main", city: "Cftowncity", country: "US" } },
      });
      const r = await run(db, actorOf(w.alice.id), "cftowncity");
      expect(r.people.map((x) => x.id)).toEqual([person]);
    });
  });

  it("matches single and multi option labels through the stored ids", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const options = [
        { id: "o1", label: "Enterprisetier" },
        { id: "o2", label: "Startuptier" },
      ];
      await def(db, "single", "single_option", { options });
      await def(db, "multi", "multi_option", { options });
      const single = await addDeal(db, w, "Single", { customFields: { single: "o1" } });
      const multi = await addDeal(db, w, "Multi", { customFields: { multi: ["o2", "o1"] } });
      const other = await addDeal(db, w, "Other", { customFields: { single: "o2" } });
      const a = actorOf(w.alice.id);
      const ent = (await run(db, a, "enterprisetier")).deals.map((x) => x.id);
      expect(ent).toContain(single);
      expect(ent).toContain(multi);
      expect(ent).not.toContain(other);
      const start = (await run(db, a, "startuptier")).deals.map((x) => x.id);
      expect(start).toContain(multi);
      expect(start).toContain(other);
      expect(start).not.toContain(single);
    });
  });

  it("does not match numbers, dates or record references", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await def(db, "num", "numeric");
      await def(db, "dt", "date");
      await def(db, "usr", "user");
      await addDeal(db, w, "Title", {
        customFields: { num: 123456, dt: "2026-11-19", usr: w.bob.id },
      });
      const a = actorOf(w.alice.id);
      expect((await run(db, a, "123456")).deals).toHaveLength(0);
      expect((await run(db, a, "2026-11-19")).deals).toHaveLength(0);
      expect((await run(db, a, w.bob.id.slice(0, 8))).deals).toHaveLength(0);
    });
  });

  it("ignores values of an archived definition", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await def(db, "old", "text", { archived: true });
      await addDeal(db, w, "Title", { customFields: { old: "archivedfieldterm" } });
      expect((await run(db, actorOf(w.alice.id), "archivedfieldterm")).deals).toHaveLength(0);
    });
  });

  it("finds the record an activity belongs to through an activity custom field", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await def(db, "actf", "text", { target: "activity", name: "Call outcome" });
      const deal = await addDeal(db, w, "Title");
      await addActivity(db, w, "Call", { dealId: deal, customFields: { actf: "actfieldterm" } });
      const r = await run(db, actorOf(w.alice.id), "actfieldterm");
      expect(r.deals[0]?.match).toMatchObject({ source: "custom_field", label: "Call outcome" });
    });
  });
});
