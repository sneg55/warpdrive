import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { leads, organizations } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { commitRow, type ImportActor } from "./commit";
import { seedValidRow } from "./commitLead.testHelpers";

it("rolls back a newly created organization when the lead cannot be created (no orphan org)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor: ImportActor = {
      id: user.id,
      type: "regular",
      isActive: true,
      groupIds: new Set<string>(),
      primaryVisibilityGroupId: null,
      flags: new Set(["contact.create"]),
    };

    const row = await seedValidRow(db, user.id, {
      primary: { title: "http://www.septa.org/" },
      organization: { name: "Ghost Transit Authority" },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");

    const orgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Ghost Transit Authority"));
    expect(orgs).toHaveLength(0);
  });
});

it("fails the row when it cannot write the fields of an organization it created", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const creatorOnly: ImportActor = {
      id: user.id,
      type: "regular",
      isActive: true,
      groupIds: new Set<string>(),
      primaryVisibilityGroupId: null,
      flags: new Set(["contact.create", "deal.create"]),
    };

    const row = await seedValidRow(db, user.id, {
      primary: { title: "No-edit lead" },
      organization: { name: "Unwritable Transit", domain: "unwritable.example" },
    });

    const r = await commitRow(db, creatorOnly, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("invalid");

    const orgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Unwritable Transit"));
    expect(orgs).toHaveLength(0);
    expect(await db.select().from(leads).where(eq(leads.title, "No-edit lead"))).toHaveLength(0);
  });
});

it("imports a lead with an org name + address as a create-only user", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const creatorOnly: ImportActor = {
      id: user.id,
      type: "regular",
      isActive: true,
      groupIds: new Set<string>(),
      primaryVisibilityGroupId: null,
      flags: new Set(["contact.create", "deal.create"]),
    };

    const row = await seedValidRow(db, user.id, {
      primary: { title: "Addressed lead" },
      organization: { name: "Addressed Transit", address: { city: "Newark", region: "NJ" } },
    });

    const r = await commitRow(db, creatorOnly, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("imported");

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Addressed Transit"));
    expect(org?.address).toEqual({ city: "Newark", region: "NJ" });
  });
});
