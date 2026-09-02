import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createDef } from "@/features/custom-fields/defsRepo";
import { listLeads, listLeadsForExport } from "./leadRepo";

function visSession(userId: string, isAdmin = false) {
  return {
    userId,
    isAdmin,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
  };
}

const sig = () => new AbortController().signal;

async function insertLead(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
  overrides: Partial<typeof leads.$inferInsert> = {},
) {
  const [row] = await db
    .insert(leads)
    .values({ title: "L", ownerId, visibilityLevel: "all", ...overrides })
    .returning();
  if (row === undefined) throw new Error("insertLead failed");
  return row;
}

const listArgs = {
  filter: "inbox" as const,
  offset: 0,
  limit: 100,
  sort: { field: "createdAt" as const, dir: "desc" as const },
  filters: {},
};

describe("listLeads custom fields", () => {
  it("returns customFields on each row", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await insertLead(db, owner.id, { customFields: { region: "west" } });
      const res = await listLeads(db, visSession(owner.id), listArgs, sig());
      expect(res.rows[0]?.customFields).toEqual({ region: "west" });
    });
  });

  it("sorts by a text custom field with empties last, and rejects an unsortable key", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const r = await createDef(db, { targetEntity: "lead", type: "text", name: "Region" }, sig());
      if (!r.ok) throw r.error;
      await insertLead(db, owner.id, { title: "z", customFields: { region: "zulu" } });
      await insertLead(db, owner.id, { title: "none" });
      await insertLead(db, owner.id, { title: "a", customFields: { region: "Alpha" } });
      const asc = await listLeads(
        db,
        visSession(owner.id),
        { ...listArgs, sort: { field: "cf:region", dir: "asc" } },
        sig(),
      );
      expect(asc.rows.map((x) => x.title)).toEqual(["a", "z", "none"]);
      const desc = await listLeads(
        db,
        visSession(owner.id),
        { ...listArgs, sort: { field: "cf:region", dir: "desc" } },
        sig(),
      );
      expect(desc.rows.map((x) => x.title)).toEqual(["z", "a", "none"]);
      await expect(
        listLeads(
          db,
          visSession(owner.id),
          { ...listArgs, sort: { field: "cf:ghost", dir: "asc" } },
          sig(),
        ),
      ).rejects.toMatchObject({ id: ERROR_IDS.CF_SORT_FIELD_INVALID });
    });
  });

  it("exports in the same custom-field order", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const r = await createDef(
        db,
        { targetEntity: "lead", type: "numeric", name: "Score" },
        sig(),
      );
      if (!r.ok) throw r.error;
      await insertLead(db, owner.id, { title: "ten", customFields: { score: 10 } });
      await insertLead(db, owner.id, { title: "two", customFields: { score: 2 } });
      const rows = await listLeadsForExport(
        db,
        visSession(owner.id),
        { ...listArgs, sort: { field: "cf:score", dir: "asc" } },
        sig(),
      );
      expect(rows.map((x) => x.title)).toEqual(["two", "ten"]);
    });
  });
});
