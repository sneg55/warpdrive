// savedFilterActions.test.ts: CRUD + permission tests for saveFilter / listSavedFilters
import { describe, expect, it } from "vitest";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  filterSessionAdmin,
  filterSessionNoFlag,
  filterSessionWithFlag,
} from "./filterAst.test-helpers";
import {
  listSavedFilters,
  removeSavedFilter,
  saveFilter,
  toggleFavorite,
  updateSavedFilter,
} from "./savedFilterActions";

describe("saveFilter", () => {
  it("SECURITY: user without filter.share cannot create a shared filter", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const result = await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "My filter",
          targetEntity: "deal",
          definition: { conditions: [] },
          isShared: true,
        },
        new AbortController().signal,
      );
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        // Sharing without filter.share is a permission denial, not a "deal not found".
        expect(result.error.id).toBe("E_PERM_001");
      }
    });
  });

  it("user WITH filter.share can create a shared filter", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const result = await saveFilter(
        db,
        filterSessionWithFlag(u.id, "filter.share"),
        {
          name: "Shared filter",
          targetEntity: "deal",
          definition: { conditions: [{ field: "status", op: "eq", value: "open" }] },
          isShared: true,
        },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);
      if (result.ok === true) {
        expect(result.value.isShared).toBe(true);
        expect(result.value.name).toBe("Shared filter");
      }
    });
  });

  it("admin can always create a shared filter", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const result = await saveFilter(
        db,
        filterSessionAdmin(u.id),
        {
          name: "Admin shared",
          targetEntity: "deal",
          definition: { conditions: [] },
          isShared: true,
        },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);
    });
  });

  it("any user can save a private (non-shared) filter", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const result = await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "Private filter",
          targetEntity: "deal",
          definition: { conditions: [] },
          isShared: false,
        },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);
    });
  });
});

describe("listSavedFilters", () => {
  it("returns own filters and shared filters, but not other users' private filters", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const alice = await seedUser(db);
      const bob = await seedUser(db);

      // Alice creates a private filter
      await saveFilter(
        db,
        filterSessionNoFlag(alice.id),
        {
          name: "Alice private",
          targetEntity: "deal",
          definition: { conditions: [] },
          isShared: false,
        },
        new AbortController().signal,
      );
      // Alice creates a shared filter (with flag)
      await saveFilter(
        db,
        filterSessionWithFlag(alice.id, "filter.share"),
        {
          name: "Alice shared",
          targetEntity: "deal",
          definition: { conditions: [] },
          isShared: true,
        },
        new AbortController().signal,
      );
      // Bob creates a private filter
      await saveFilter(
        db,
        filterSessionNoFlag(bob.id),
        {
          name: "Bob private",
          targetEntity: "deal",
          definition: { conditions: [] },
          isShared: false,
        },
        new AbortController().signal,
      );

      // Bob sees: his own private + Alice's shared
      const bobList = await listSavedFilters(
        db,
        filterSessionNoFlag(bob.id),
        "deal",
        new AbortController().signal,
      );
      const bobNames = bobList.map((f) => f.name).sort();
      expect(bobNames).toEqual(["Alice shared", "Bob private"]);

      // Alice sees: both her own + her shared (not Bob's private)
      const aliceList = await listSavedFilters(
        db,
        filterSessionNoFlag(alice.id),
        "deal",
        new AbortController().signal,
      );
      const aliceNames = aliceList.map((f) => f.name).sort();
      expect(aliceNames).toEqual(["Alice private", "Alice shared"]);
    });
  });
});

describe("removeSavedFilter / updateSavedFilter / toggleFavorite", () => {
  async function seedOne(db: Parameters<Parameters<typeof withTestDb>[0]>[0], userId: string) {
    const r = await saveFilter(
      db,
      filterSessionNoFlag(userId),
      { name: "Mine", targetEntity: "deal", definition: { conditions: [] }, isShared: false },
      new AbortController().signal,
    );
    if (r.ok === false) throw new Error("seed filter failed");
    return r.value;
  }

  it("owner can update name + definition", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const f = await seedOne(db, u.id);
      const r = await updateSavedFilter(
        db,
        filterSessionNoFlag(u.id),
        f.id,
        {
          name: "Renamed",
          definition: { conditions: [{ field: "status", op: "eq", value: "open" }] },
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.name).toBe("Renamed");
    });
  });

  it("SECURITY: updating isShared to true without filter.share is rejected", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const f = await seedOne(db, u.id);
      const r = await updateSavedFilter(
        db,
        filterSessionNoFlag(u.id),
        f.id,
        { isShared: true },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
    });
  });

  it("non-owner cannot remove (reported not-found)", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const f = await seedOne(db, owner.id);
      const r = await removeSavedFilter(
        db,
        filterSessionNoFlag(other.id),
        f.id,
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      const still = await listSavedFilters(
        db,
        filterSessionNoFlag(owner.id),
        "deal",
        new AbortController().signal,
      );
      expect(still).toHaveLength(1);
    });
  });

  it("toggleFavorite flips the owner's favorite flag", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const f = await seedOne(db, u.id);
      const on = await toggleFavorite(
        db,
        filterSessionNoFlag(u.id),
        f.id,
        new AbortController().signal,
      );
      expect(on.ok && on.value.favorite).toBe(true);
      const off = await toggleFavorite(
        db,
        filterSessionNoFlag(u.id),
        f.id,
        new AbortController().signal,
      );
      expect(off.ok && off.value.favorite).toBe(false);
    });
  });
});
