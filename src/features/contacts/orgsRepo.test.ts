import { describe, expect, it } from "vitest";
import { deals, organizations } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { addressIsValid, createOrg, getOrg, listOrgs, updateOrg } from "./orgsRepo";
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

// CONTACTS-20: the Org Summary edits Street/City/Region/Country as independent inline fields,
// so a partial address (no Country) is legitimate and must validate. Pure unit coverage of the
// relaxed rule; the only remaining invariant is coordinate pairing.
describe("addressIsValid", () => {
  it("accepts a partial address with no country (street/city only)", () => {
    expect(addressIsValid({ street: "500 Main St", city: "SF" })).toBe(true);
  });
  it("accepts a region-only address", () => {
    expect(addressIsValid({ region: "CA" })).toBe(true);
  });
  it("accepts an empty address", () => {
    expect(addressIsValid({})).toBe(true);
  });
  it("accepts a full address", () => {
    expect(addressIsValid({ street: "1 Main", city: "SF", region: "CA", country: "US" })).toBe(
      true,
    );
  });
  it("accepts coordinates supplied as a pair", () => {
    expect(addressIsValid({ lat: 37.7, lng: -122.4 })).toBe(true);
  });
  it("rejects a lone latitude (coordinates must come as a pair)", () => {
    expect(addressIsValid({ lat: 37.7 })).toBe(false);
  });
});

it("listOrgs splits deal counts into closed (won+lost) and open per org (CV-4 / spec B4)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db);
    const { pipeline, stages } = await seedPipelineWithStages(db, ["Qualified"]);
    const stageId = stages[0]?.id ?? "";

    const [org] = await db
      .insert(organizations)
      .values({ name: "Apex Labs", ownerId: me.id, visibilityLevel: "all", customFields: {} })
      .returning();
    const orgId = org?.id ?? "";

    const dealBase = {
      pipelineId: pipeline.id,
      stageId,
      ownerId: me.id,
      visibilityLevel: "all" as const,
      orgId,
    };
    await db.insert(deals).values([
      { ...dealBase, title: "Won A", status: "won" },
      { ...dealBase, title: "Lost B", status: "lost" },
      { ...dealBase, title: "Open C", status: "open" },
      { ...dealBase, title: "Open D", status: "open" },
    ]);

    const res = await listOrgs(db, regularActor(me.id), { offset: 0, limit: 50 }, signal);
    const row = res.rows.find((r) => r.id === orgId);
    expect(row?.closedDeals).toBe(2);
    expect(row?.openDeals).toBe(2);
  });
});

it("creates an org with a derived owner and reads it back", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db);
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };

    const r = await createOrg(
      db,
      meActor,
      {
        name: "Acme Inc",
        address: { street: "500 Main St", city: "SF", region: "CA", country: "US" },
        customFields: {},
      },
      signal,
    );
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.ownerId).toBe(me.id);
      const got = await getOrg(db, meActor, r.value.id, signal);
      expect(got.ok).toBe(true);
    }
  });
});

it("getOrg resolves the owner's name via the users join (Wave 4, Task 5)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db, { name: "Ann Owner" });
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };

    const created = await createOrg(
      db,
      meActor,
      { name: "Acme Inc", address: null, customFields: {} },
      signal,
    );
    if (created.ok === false) throw new Error(`setup failed: ${created.error.message}`);

    const got = await getOrg(db, meActor, created.value.id, signal);
    expect(got.ok).toBe(true);
    if (got.ok === true) expect(got.value.ownerName).toBe("Ann Owner");
  });
});

it("accepts a partial address missing country end-to-end (CONTACTS-20)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db);
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };

    const r = await createOrg(
      db,
      meActor,
      { name: "NoCountry", address: { city: "SF" }, customFields: {} },
      signal,
    );
    expect(r.ok).toBe(true);
    if (r.ok === true) expect((r.value.address as { city: string }).city).toBe("SF");
  });
});

it("returns a 404-shape from getOrg for a non-uuid id instead of throwing (bad param -> 404)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db);
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };
    const got = await getOrg(db, meActor, "not-a-uuid", signal);
    expect(got.ok).toBe(false);
    if (got.ok === false) expect(got.error.id).toBe("E_CONTACT_001");
  });
});

it("updateOrg persists firmographic fields", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db);
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      // contact.edit is capability-gated separately from visibility (F2): the owner needs
      // contact.edit_own to mutate their own record, matching contactEditAuthz.test.ts.
      flags: new Set(["contact.edit_own"]),
      primaryVisibilityGroupId: null,
    };

    const created = await createOrg(
      db,
      meActor,
      { name: "Acme Inc", address: null, customFields: {} },
      signal,
    );
    expect(created.ok).toBe(true);
    if (created.ok === false) return;

    const r = await updateOrg(
      db,
      meActor,
      {
        id: created.value.id,
        industry: "SaaS",
        employeeCount: 200,
        annualRevenue: "5000000",
        domain: "acme.com",
        linkedinUrl: "https://linkedin.com/company/acme",
      },
      signal,
    );
    expect(r.ok).toBe(true);
    if (r.ok === false) return;
    expect(r.value.industry).toBe("SaaS");
    expect(r.value.employeeCount).toBe(200);
    expect(r.value.annualRevenue).toBe("5000000.00");
    expect(r.value.domain).toBe("acme.com");
    expect(r.value.linkedinUrl).toBe("https://linkedin.com/company/acme");

    const reread = await getOrg(db, meActor, created.value.id, signal);
    expect(reread.ok).toBe(true);
    if (reread.ok === true) expect(reread.value.industry).toBe("SaaS");
  });
});
