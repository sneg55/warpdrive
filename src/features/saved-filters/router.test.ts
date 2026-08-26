// @vitest-environment node
// Integration tests for the saved-filters tRPC router against real Postgres (no DB mocks).
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { HydratedActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";
import { filterSessionNoFlag } from "./filterAst.test-helpers";
import { saveFilter } from "./savedFilterActions";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

function makeActor(id: string): HydratedActor {
  return {
    id,
    type: "regular",
    isActive: true,
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    flags: new Set<PermissionFlagKey>(),
    groupIds: new Set<string>(),
  };
}

function makeCaller(db: Db, userId: string): ReturnType<typeof createCaller> {
  return createCaller({
    db,
    session: { userId, sessionId: "test-session" },
    actor: makeActor(userId),
  });
}

async function seedSettings(db: Db): Promise<void> {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
}

describe("savedFilters.listByTarget", () => {
  it("returns the actor's person views with a parsed definition and isOwn", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      await saveFilter(
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
      const rows = await makeCaller(db, u.id).savedFilters.listByTarget({
        targetEntity: "person",
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe("Acme people");
      expect(rows[0]?.isOwn).toBe(true);
      expect(rows[0]?.definition).toEqual({
        combinator: "and",
        conditions: [{ field: "primaryEmail", op: "contains", value: "acme" }],
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
          definition: { conditions: [{ field: "title", op: "contains", value: "acme" }] },
          isShared: false,
        },
        new AbortController().signal,
      );
      const rows = await makeCaller(db, u.id).savedFilters.listByTarget({
        targetEntity: "person",
      });
      expect(rows).toEqual([]);
    });
  });

  it("marks another user's shared view as not own", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      await saveFilter(
        db,
        { userId: alice.id, isAdmin: false, flags: { "filter.share": true } },
        {
          name: "Alice shared leads",
          targetEntity: "lead",
          definition: { conditions: [{ field: "sourceOrigin", op: "eq", value: "web" }] },
          isShared: true,
        },
        new AbortController().signal,
      );
      const rows = await makeCaller(db, bob.id).savedFilters.listByTarget({ targetEntity: "lead" });
      expect(rows.map((r) => [r.name, r.isOwn])).toEqual([["Alice shared leads", false]]);
    });
  });
});

describe("deal.savedFilters", () => {
  it("keeps returning deal rows with isOwn and a deal-parsed definition", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      await saveFilter(
        db,
        filterSessionNoFlag(u.id),
        {
          name: "Big deals",
          targetEntity: "deal",
          definition: { conditions: [{ field: "value", op: "gt", value: 100 }], rotting: true },
          isShared: false,
        },
        new AbortController().signal,
      );
      const rows = await makeCaller(db, u.id).deal.savedFilters();
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row?.isOwn).toBe(true);
      expect(row?.targetEntity).toBe("deal");
      expect(row?.definition).toEqual({
        combinator: "and",
        conditions: [{ field: "value", op: "gt", value: 100 }],
        rotting: true,
      });
      expect(Object.keys(row ?? {}).sort()).toEqual([
        "createdAt",
        "definition",
        "favorite",
        "id",
        "isOwn",
        "isShared",
        "name",
        "ownerId",
        "targetEntity",
        "updatedAt",
      ]);
    });
  });
});
