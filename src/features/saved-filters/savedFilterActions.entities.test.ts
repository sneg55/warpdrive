// A saved view exists for people, orgs and leads too, so every action has to work off the row's
// own target entity instead of assuming the deal field allow-list.
import { describe, expect, it } from "vitest";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { filterSessionNoFlag, filterSessionWithFlag } from "./filterAst.test-helpers";
import {
  listSavedFilters,
  removeSavedFilter,
  saveFilter,
  updateSavedFilter,
} from "./savedFilterActions";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedSettings(db: Db): Promise<void> {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
}

const NAME_CONTAINS = { field: "name", op: "contains", value: "acme" } as const;

describe("saveFilter across entities", () => {
  it("saves a person view and reads it back under its own target", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const saved = await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "Acme people",
          targetEntity: "person",
          definition: { conditions: [{ field: "primaryEmail", op: "contains", value: "acme" }] },
          isShared: false,
        },
        new AbortController().signal,
      );
      expect(saved.ok).toBe(true);
      const list = await listSavedFilters(
        db,
        filterSessionNoFlag(u.id),
        "person",
        new AbortController().signal,
      );
      expect(list.map((f) => f.name)).toEqual(["Acme people"]);
      expect(list[0]?.targetEntity).toBe("person");
    });
  });

  it("rejects a person view carrying a deal-only field", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const r = await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "Bad",
          targetEntity: "person",
          definition: {
            conditions: [
              { field: "stageId", op: "eq", value: "11111111-1111-4111-8111-111111111111" },
            ],
          },
          isShared: false,
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error.id).toBe("E_DEAL_008");
    });
  });

  it("round-trips an org view and a lead view", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const org = await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "SaaS orgs",
          targetEntity: "organization",
          definition: { conditions: [{ field: "industry", op: "eq", value: "SaaS" }] },
          isShared: false,
        },
        new AbortController().signal,
      );
      const lead = await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "Web leads",
          targetEntity: "lead",
          definition: {
            combinator: "or",
            conditions: [{ field: "sourceOrigin", op: "eq", value: "web" }],
          },
          isShared: false,
        },
        new AbortController().signal,
      );
      expect([org.ok, lead.ok]).toEqual([true, true]);
      const orgs = await listSavedFilters(
        db,
        filterSessionNoFlag(u.id),
        "organization",
        new AbortController().signal,
      );
      expect(orgs.map((f) => f.name)).toEqual(["SaaS orgs"]);
      const leads = await listSavedFilters(
        db,
        filterSessionNoFlag(u.id),
        "lead",
        new AbortController().signal,
      );
      expect(leads[0]?.definition).toEqual({
        combinator: "or",
        conditions: [{ field: "sourceOrigin", op: "eq", value: "web" }],
      });
    });
  });

  it("does not return deal views under the person target", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "Deal view",
          targetEntity: "deal",
          definition: { conditions: [] },
          isShared: false,
        },
        new AbortController().signal,
      );
      await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "Person view",
          targetEntity: "person",
          definition: { conditions: [NAME_CONTAINS] },
          isShared: false,
        },
        new AbortController().signal,
      );
      const people = await listSavedFilters(
        db,
        filterSessionNoFlag(u.id),
        "person",
        new AbortController().signal,
      );
      expect(people.map((f) => f.name)).toEqual(["Person view"]);
    });
  });

  it("SECURITY: sharing a person view still needs filter.share", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const denied = await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "Shared people",
          targetEntity: "person",
          definition: { conditions: [NAME_CONTAINS] },
          isShared: true,
        },
        new AbortController().signal,
      );
      expect(denied.ok).toBe(false);
      if (denied.ok === false) expect(denied.error.id).toBe("E_PERM_001");
      const allowed = await saveFilter(
        db,
        filterSessionWithFlag(u.id, "filter.share"),
        {
          name: "Shared people",
          targetEntity: "person",
          definition: { conditions: [NAME_CONTAINS] },
          isShared: true,
        },
        new AbortController().signal,
      );
      expect(allowed.ok).toBe(true);
    });
  });
});

describe("updateSavedFilter / removeSavedFilter on a non-deal view", () => {
  async function seedPersonView(db: Db, userId: string): Promise<string> {
    const r = await saveFilter(
      db,
      filterSessionNoFlag(userId),
      {
        name: "Mine",
        targetEntity: "person",
        definition: { conditions: [NAME_CONTAINS] },
        isShared: false,
      },
      new AbortController().signal,
    );
    if (r.ok === false) throw new Error("seed person view failed");
    return r.value.id;
  }

  it("validates the patch against the row's own entity", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const id = await seedPersonView(db, u.id);
      const good = await updateSavedFilter(
        db,
        filterSessionNoFlag(u.id),
        id,
        { definition: { conditions: [{ field: "primaryEmail", op: "contains", value: "b" }] } },
        new AbortController().signal,
      );
      expect(good.ok).toBe(true);
      const bad = await updateSavedFilter(
        db,
        filterSessionNoFlag(u.id),
        id,
        { definition: { conditions: [{ field: "stageId", op: "eq", value: "x" }] } },
        new AbortController().signal,
      );
      expect(bad.ok).toBe(false);
      if (bad.ok === false) expect(bad.error.id).toBe("E_DEAL_008");
    });
  });

  it("SECURITY: a non-owner can neither update nor delete it", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const id = await seedPersonView(db, owner.id);
      const upd = await updateSavedFilter(
        db,
        filterSessionNoFlag(other.id),
        id,
        { name: "Stolen" },
        new AbortController().signal,
      );
      expect(upd.ok).toBe(false);
      const del = await removeSavedFilter(
        db,
        filterSessionNoFlag(other.id),
        id,
        new AbortController().signal,
      );
      expect(del.ok).toBe(false);
      const still = await listSavedFilters(
        db,
        filterSessionNoFlag(owner.id),
        "person",
        new AbortController().signal,
      );
      expect(still.map((f) => f.name)).toEqual(["Mine"]);
    });
  });
});
