import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createDef } from "./defsRepo";
import { customFieldOrderBy, resolveCustomFieldSort } from "./sortSql";

const sig = () => new AbortController().signal;

async function seedPerson(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
  name: string,
  customFields: Record<string, unknown>,
) {
  await db.insert(persons).values({ name, ownerId, visibilityLevel: "all", customFields });
}

async function namesOrderedBy(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  orderBy: ReturnType<typeof customFieldOrderBy>,
) {
  const rows = await db.select({ name: persons.name }).from(persons).orderBy(orderBy, persons.id);
  return rows.map((r) => r.name);
}

describe("resolveCustomFieldSort", () => {
  it("returns the def for a live sortable key and rejects the rest", async () => {
    await withTestDb(async (db) => {
      const live = await createDef(
        db,
        { targetEntity: "person", type: "text", name: "Region" },
        sig(),
      );
      const multi = await createDef(
        db,
        { targetEntity: "person", type: "multi_option", name: "Tags" },
        sig(),
      );
      if (!live.ok) throw live.error;
      if (!multi.ok) throw multi.error;
      const def = await resolveCustomFieldSort(db, "person", "cf:region", sig());
      expect(def.id).toBe(live.value.id);
      await expect(resolveCustomFieldSort(db, "person", "cf:tags", sig())).rejects.toMatchObject({
        id: ERROR_IDS.CF_SORT_FIELD_INVALID,
      });
      await expect(resolveCustomFieldSort(db, "person", "cf:ghost", sig())).rejects.toMatchObject({
        id: ERROR_IDS.CF_SORT_FIELD_INVALID,
      });
      await expect(resolveCustomFieldSort(db, "person", "name", sig())).rejects.toMatchObject({
        id: ERROR_IDS.CF_SORT_FIELD_INVALID,
      });
    });
  });
});

describe("customFieldOrderBy", () => {
  it("sorts text case-insensitively with empties last both ways", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await createDef(
        db,
        { targetEntity: "person", type: "text", name: "Region" },
        sig(),
      );
      if (!r.ok) throw r.error;
      await seedPerson(db, u.id, "b", { region: "beta" });
      await seedPerson(db, u.id, "none", {});
      await seedPerson(db, u.id, "A", { region: "Alpha" });
      await seedPerson(db, u.id, "blank", { region: "" });
      const asc = await namesOrderedBy(
        db,
        customFieldOrderBy(persons.customFields, r.value, "asc"),
      );
      expect(asc.slice(0, 2)).toEqual(["A", "b"]);
      expect(new Set(asc.slice(2))).toEqual(new Set(["none", "blank"]));
      const desc = await namesOrderedBy(
        db,
        customFieldOrderBy(persons.customFields, r.value, "desc"),
      );
      expect(desc.slice(0, 2)).toEqual(["b", "A"]);
      expect(new Set(desc.slice(2))).toEqual(new Set(["none", "blank"]));
    });
  });

  it("sorts numerics as numbers and treats a stored string as empty", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await createDef(
        db,
        { targetEntity: "person", type: "numeric", name: "Seats" },
        sig(),
      );
      if (!r.ok) throw r.error;
      await seedPerson(db, u.id, "ten", { seats: 10 });
      await seedPerson(db, u.id, "nine", { seats: 9 });
      await seedPerson(db, u.id, "bad", { seats: "7" });
      expect(
        await namesOrderedBy(db, customFieldOrderBy(persons.customFields, r.value, "asc")),
      ).toEqual(["nine", "ten", "bad"]);
    });
  });

  it("sorts single_option by option order, archived last", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await createDef(
        db,
        {
          targetEntity: "person",
          type: "single_option",
          name: "Tier",
          options: [
            { id: "gold", label: "Gold" },
            { id: "retired", label: "Retired", archived: true },
            { id: "silver", label: "Silver" },
          ],
        },
        sig(),
      );
      if (!r.ok) throw r.error;
      await seedPerson(db, u.id, "s", { tier: "silver" });
      await seedPerson(db, u.id, "r", { tier: "retired" });
      await seedPerson(db, u.id, "g", { tier: "gold" });
      await seedPerson(db, u.id, "u", { tier: "unknown" });
      expect(
        await namesOrderedBy(db, customFieldOrderBy(persons.customFields, r.value, "asc")),
      ).toEqual(["g", "s", "r", "u"]);
    });
  });

  it("sorts dates lexically", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await createDef(db, { targetEntity: "person", type: "date", name: "Since" }, sig());
      if (!r.ok) throw r.error;
      await seedPerson(db, u.id, "later", { since: "2026-03-01" });
      await seedPerson(db, u.id, "earlier", { since: "2025-12-31" });
      expect(
        await namesOrderedBy(db, customFieldOrderBy(persons.customFields, r.value, "desc")),
      ).toEqual(["later", "earlier"]);
    });
  });
});
