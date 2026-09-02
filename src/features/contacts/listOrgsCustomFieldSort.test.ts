import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { organizations } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createDef } from "@/features/custom-fields/defsRepo";
import { listOrgs } from "./orgsRepo";
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

async function seedOrg(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  opts: {
    name: string;
    ownerId: string;
    visibilityLevel: "owner" | "group" | "all";
    customFields?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(organizations).values({
    name: opts.name,
    ownerId: opts.ownerId,
    visibilityLevel: opts.visibilityLevel,
    visibilityGroupId: null,
    customFields: opts.customFields ?? {},
  });
}

describe("listOrgs custom-field sort", () => {
  it("sorts by a numeric custom field, empties last, and rejects an unknown key", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const r = await createDef(
        db,
        { targetEntity: "organization", type: "numeric", name: "Seats" },
        signal,
      );
      if (r.ok === false) throw r.error;
      await seedOrg(db, {
        name: "ten",
        ownerId: me.id,
        visibilityLevel: "all",
        customFields: { seats: 10 },
      });
      await seedOrg(db, { name: "none", ownerId: me.id, visibilityLevel: "all" });
      await seedOrg(db, {
        name: "two",
        ownerId: me.id,
        visibilityLevel: "all",
        customFields: { seats: 2 },
      });

      const res = await listOrgs(
        db,
        regularActor(me.id),
        { offset: 0, limit: 50, sort: { field: "cf:seats", dir: "desc" } },
        signal,
      );

      expect(res.rows.map((o) => o.name)).toEqual(["ten", "two", "none"]);
      expect(res.rows[0]?.customFields).toEqual({ seats: 10 });

      await expect(
        listOrgs(
          db,
          regularActor(me.id),
          { offset: 0, limit: 50, sort: { field: "cf:nope", dir: "asc" } },
          signal,
        ),
      ).rejects.toMatchObject({ id: ERROR_IDS.CF_SORT_FIELD_INVALID });
    });
  });

  it("sorts by a single_option custom field in option-definition order", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const me = await seedUser(db);
      const options = [
        { id: "opt-high", label: "High" },
        { id: "opt-med", label: "Medium" },
        { id: "opt-low", label: "Low" },
      ];
      const r = await createDef(
        db,
        { targetEntity: "organization", type: "single_option", name: "Priority", options },
        signal,
      );
      if (r.ok === false) throw r.error;
      await seedOrg(db, {
        name: "LowOrg",
        ownerId: me.id,
        visibilityLevel: "all",
        customFields: { priority: "opt-low" },
      });
      await seedOrg(db, {
        name: "HighOrg",
        ownerId: me.id,
        visibilityLevel: "all",
        customFields: { priority: "opt-high" },
      });
      await seedOrg(db, {
        name: "MedOrg",
        ownerId: me.id,
        visibilityLevel: "all",
        customFields: { priority: "opt-med" },
      });

      const res = await listOrgs(
        db,
        regularActor(me.id),
        { offset: 0, limit: 50, sort: { field: "cf:priority", dir: "asc" } },
        signal,
      );

      expect(res.rows.map((o) => o.name)).toEqual(["HighOrg", "MedOrg", "LowOrg"]);
    });
  });
});
