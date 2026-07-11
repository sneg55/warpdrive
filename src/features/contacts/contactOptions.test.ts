import { describe, expect, it } from "vitest";
import { organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listOrgOptions } from "./orgOptionsRepo";
import { listPersonOptions } from "./personOptionsRepo";
import type { ContactActor } from "./personsRepo";

function regularActor(id: string): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
    primaryVisibilityGroupId: null,
  };
}

describe("listPersonOptions", () => {
  it("returns every visible person as {id,name}, name-sorted, with no pagination cap", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const other = await seedUser(db);
      // More than the old 500-row page cap would have allowed, to prove the cap is gone.
      const rows = Array.from({ length: 600 }, (_, i) => ({
        name: `P${String(i).padStart(4, "0")}`,
        primaryEmail: `p${i}@example.com`,
        emails: [],
        phones: [],
        orgId: null,
        ownerId: me.id,
        visibilityLevel: "all" as const,
        visibilityGroupId: null,
        customFields: {},
      }));
      await db.insert(persons).values(rows);
      await db.insert(persons).values({
        name: "Hidden",
        primaryEmail: "hidden@example.com",
        emails: [],
        phones: [],
        orgId: null,
        ownerId: other.id,
        visibilityLevel: "owner",
        visibilityGroupId: null,
        customFields: {},
      });

      const opts = await listPersonOptions(db, regularActor(me.id), signal);

      expect(opts).toHaveLength(600);
      expect(opts.every((o) => o.name.startsWith("P"))).toBe(true);
      expect(opts[0]).toEqual({ id: expect.any(String), name: "P0000" });
      // Hidden (owner-visibility, not mine) must not appear.
      expect(opts.some((o) => o.name === "Hidden")).toBe(false);
    });
  });
});

describe("listOrgOptions", () => {
  it("returns every visible organization as {id,name}, name-sorted", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      await db.insert(organizations).values([
        {
          name: "Beta",
          ownerId: me.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        },
        {
          name: "Acme",
          ownerId: me.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        },
      ]);

      const opts = await listOrgOptions(db, regularActor(me.id), signal);
      expect(opts.map((o) => o.name)).toEqual(["Acme", "Beta"]);
      expect(opts[0]).toEqual({ id: expect.any(String), name: "Acme" });
    });
  });
});
