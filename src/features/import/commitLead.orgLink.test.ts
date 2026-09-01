import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { leads, organizations } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createOrg } from "@/features/contacts/orgsRepo";
import { orgCreateInput } from "@/features/contacts/schemas";
import { commitRow } from "./commit";
import { adminActorFor, seedValidRow } from "./commitLead.testHelpers";

it("links a lead to an existing organization matched by name", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const orgRes = await createOrg(
      db,
      actor,
      orgCreateInput.parse({ name: "Chicago Transit Authority" }),
      signal,
    );
    if (orgRes.ok === false) throw new Error("org seed failed");

    const row = await seedValidRow(db, user.id, {
      primary: { title: "http://www.transitchicago.com/" },
      organization: { name: "Chicago Transit Authority" },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    const [created] = await db
      .select()
      .from(leads)
      .where(eq(leads.title, "http://www.transitchicago.com/"));
    expect(created?.orgId).toBe(orgRes.value.id);

    const orgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Chicago Transit Authority"));
    expect(orgs).toHaveLength(1);
  });
});

it("creates and links a new organization when the name is not found", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      primary: { title: "http://www.njtransit.com/" },
      organization: { name: "New Jersey Transit Corporation" },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "New Jersey Transit Corporation"));
    expect(org).toBeDefined();

    const [created] = await db
      .select()
      .from(leads)
      .where(eq(leads.title, "http://www.njtransit.com/"));
    expect(created?.orgId).toBe(org?.id);
  });
});

it("fails the row (invalid) when the organization name matches multiple visible orgs", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    await createOrg(db, actor, orgCreateInput.parse({ name: "County of Miami-Dade" }), signal);
    await createOrg(db, actor, orgCreateInput.parse({ name: "County of Miami-Dade" }), signal);

    const row = await seedValidRow(db, user.id, {
      primary: { title: "http://www.miamidade.gov/transit/" },
      organization: { name: "County of Miami-Dade" },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");

    const created = await db
      .select()
      .from(leads)
      .where(eq(leads.title, "http://www.miamidade.gov/transit/"));
    expect(created).toHaveLength(0);
  });
});

it("writes every mapped org field onto an organization it creates", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      primary: { title: "NJ Transit lead" },
      organization: {
        name: "New Jersey Transit Corporation",
        domain: "njtransit.com",
        employeeCount: 3431,
        address: { city: "Newark", region: "NJ" },
      },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "New Jersey Transit Corporation"));
    expect(org?.domain).toBe("njtransit.com");
    expect(org?.employeeCount).toBe(3431);
    expect(org?.address).toEqual({ city: "Newark", region: "NJ" });
  });
});

it("fills only the blank fields of a pre-existing organization, never clobbering one", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const orgRes = await createOrg(
      db,
      actor,
      orgCreateInput.parse({ name: "Chicago Transit Authority" }),
      signal,
    );
    if (orgRes.ok === false) throw new Error("org seed failed");
    await db
      .update(organizations)
      .set({ domain: "www.transitchicago.com" })
      .where(eq(organizations.id, orgRes.value.id));

    const row = await seedValidRow(db, user.id, {
      primary: { title: "CTA lead" },
      organization: {
        name: "Chicago Transit Authority",
        domain: "transitchicago.com",
        industry: "Public Transit",
      },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgRes.value.id));
    expect(org?.domain).toBe("www.transitchicago.com");
    expect(org?.industry).toBe("Public Transit");
  });
});
