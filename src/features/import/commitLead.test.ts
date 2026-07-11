import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows, leads, notes, organizations } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createOrg } from "@/features/contacts/orgsRepo";
import { orgCreateInput } from "@/features/contacts/schemas";
import type { MappedRow } from "@/types/import";
import { commitRow, type ImportActor } from "./commit";

// Admin bypasses createLead's deal.create gate, keeping these tests focused on the
// commit mechanics rather than permission-flag plumbing.
function adminActorFor(id: string): ImportActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(),
  };
}

async function seedValidRow(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  userId: string,
  mapped: MappedRow,
): Promise<{ id: string }> {
  const [batch] = await db
    .insert(importBatches)
    .values({ targetEntity: "lead", filename: "l.csv", createdBy: userId })
    .returning();
  if (batch === undefined) throw new Error("batch seed failed");
  const [row] = await db
    .insert(importRows)
    .values({ batchId: batch.id, rowNumber: 1, raw: {}, mapped, status: "valid" })
    .returning();
  if (row === undefined) throw new Error("row seed failed");
  return row;
}

it("creates a lead (no pipeline/stage, no dedup key)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      primary: { title: "A promising lead", value: 500 },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db.select().from(leads).where(eq(leads.title, "A promising lead"));
    expect(created).toHaveLength(1);
    expect(created[0]?.ownerId).toBe(user.id);
  });
});

it("re-running commitRow on an already-imported lead row is an idempotent no-op", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, { primary: { title: "Retry lead" } });
    await commitRow(db, actor, row.id, "lead", "skip", signal);
    const second = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(second.ok).toBe(true);

    const created = await db.select().from(leads).where(eq(leads.title, "Retry lead"));
    expect(created).toHaveLength(1);
  });
});

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

    // Reused the existing org, did not create a second one.
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

    // Two visible orgs share a name: linking cannot pick one safely.
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

it("creates a lead with no org link when the Organization column is unmapped/blank", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, { primary: { title: "Standalone lead" } });
    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    const [created] = await db.select().from(leads).where(eq(leads.title, "Standalone lead"));
    expect(created?.orgId).toBeNull();
  });
});

it("rolls back a newly created organization when the lead cannot be created (no orphan org)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    // contact.create lets the actor create the org, but createLead's deal.create gate fails,
    // so the lead is never created. The org must roll back rather than orphan.
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

it("reports a lead row missing the required title as invalid (not silently dropped)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, { primary: { value: 500 } });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");
  });
});

// Cross-entity mapping: a BD shortlist row is a lead AND its organization. The org's firmographics
// (url -> domain, city/state -> address) ride along in the row's organization group.
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

// The whole point of fill-blank enrichment: a 115-row import may fill gaps but must never
// overwrite a value someone curated by hand.
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
    // A human already curated the domain. The import must leave it alone.
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
    // Curated value survives; the blank one gets filled.
    expect(org?.domain).toBe("www.transitchicago.com");
    expect(org?.industry).toBe("Public Transit");
  });
});

it("creates a note on the lead and records it for undo", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      primary: { title: "Noted lead" },
      note: { body: "posture: fails-validation\nmatch_confidence: high" },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    const [lead] = await db.select().from(leads).where(eq(leads.title, "Noted lead"));
    const rowNotes = await db.select().from(notes).where(eq(notes.entityId, lead!.id));
    expect(rowNotes).toHaveLength(1);
    expect(rowNotes[0]?.entityType).toBe("lead");
    expect(rowNotes[0]?.body).toBe("posture: fails-validation\nmatch_confidence: high");

    // Persisted so undo can remove the note too.
    const [persisted] = await db.select().from(importRows).where(eq(importRows.id, row.id));
    expect(persisted?.createdNoteId).toBe(rowNotes[0]?.id);
  });
});

// A lead-create failure must roll back the org AND the note the same row just created.
it("rolls back a newly created organization when the org name is ambiguous", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    for (let n = 0; n < 2; n++) {
      const res = await createOrg(
        db,
        actor,
        orgCreateInput.parse({ name: "Twin Transit" }),
        signal,
      );
      if (res.ok === false) throw new Error("org seed failed");
    }

    const row = await seedValidRow(db, user.id, {
      primary: { title: "Ambiguous lead" },
      organization: { name: "Twin Transit", domain: "twin.example" },
      note: { body: "should not survive" },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("invalid");

    // No lead, and no note left behind.
    expect(await db.select().from(leads).where(eq(leads.title, "Ambiguous lead"))).toHaveLength(0);
    expect(await db.select().from(notes).where(eq(notes.body, "should not survive"))).toHaveLength(
      0,
    );
  });
});

// A user with contact.create but not contact.edit can bring the org into existence but not write
// its firmographics. Swallowing that denial would create a bare org and silently discard every
// mapped field. Fail the row instead: enrichment of someone else's org is optional, populating an
// org this row just created is not.
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

    // The org create is rolled back with the row: no bare org left behind, no lead.
    const orgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Unwritable Transit"));
    expect(orgs).toHaveLength(0);
    expect(await db.select().from(leads).where(eq(leads.title, "No-edit lead"))).toHaveLength(0);
  });
});

// A create-only user (contact.create + deal.create, no contact.edit) importing a lead whose org
// row maps only name + address must succeed: createOrg persists the address, so nothing needs the
// contact.edit-gated updateOrg. This is the finding that the create path must not route address
// through enrichment.
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
