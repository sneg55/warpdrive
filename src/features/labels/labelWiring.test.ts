// The join tables (deal_labels/person_labels/org_labels/lead_labels) were schema-only: every
// writer wrote the entity's `labels` text[] and nothing ever inserted a join row, so the catalog
// had no referential link to what records actually carried. These tests pin the invariant from
// the OUTSIDE, through the real write paths, so a new writer that forgets to sync fails here.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dealLabels, leadLabels, orgLabels, personLabels } from "@/db/schema/labels";
import { leads } from "@/db/schema/leads";
import { organizations } from "@/db/schema/organizations";
import { persons } from "@/db/schema/persons";
import { labels } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { updateOrg } from "@/features/contacts/orgsRepo";
import { type ContactActor, updatePerson } from "@/features/contacts/personsRepo";
import { updateDeal } from "@/features/deals/dealActions";
import { adminSession } from "@/features/deals/dealMove.test-helpers";
import { setupDeal } from "@/features/deals/dealUpdate.test-helpers";
import { createLead, type LeadSession } from "@/features/leads/leadActions";
import { bulkUpdateLeads } from "@/features/leads/leadBulk";
import { convertLead } from "@/features/leads/leadConvert";
import { updateLead } from "@/features/leads/leadUpdate";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

const sig = () => new AbortController().signal;

function contactActor(id: string): ContactActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
    primaryVisibilityGroupId: null,
  };
}

function session(userId: string, extra: Partial<LeadSession> = {}): LeadSession {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
    managedUserIds: [] as string[],
    primaryVisibilityGroupId: null,
    flags: { "deal.create": true },
    ...extra,
  };
}

// The names linked to an entity, read back through the join table.
async function linkedNames(
  db: Db,
  join: typeof leadLabels | typeof dealLabels | typeof personLabels | typeof orgLabels,
  entityCol: Parameters<typeof eq>[0],
  entityId: string,
): Promise<string[]> {
  const rows = await db
    .select({ name: labels.name })
    .from(join)
    .innerJoin(labels, eq(join.labelId, labels.id))
    .where(eq(entityCol, entityId));
  return rows.map((r) => r.name).sort();
}

describe("label join rows follow the entity label arrays", () => {
  it("links labels applied when a lead is created", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await createLead(
        db,
        session(u.id),
        { title: "Acme", labels: ["high priority"], sourceOrigin: "manually_created" },
        sig(),
      );
      if (!r.ok) throw new Error("createLead failed");

      expect(await linkedNames(db, leadLabels, leadLabels.leadId, r.value.id)).toEqual([
        "high priority",
      ]);
    });
  });

  it("re-links when a lead's labels are updated, and unlinks what was removed", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const [lead] = await db
        .insert(leads)
        .values({ title: "L", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      if (lead === undefined) throw new Error("setup failed");

      await updateLead(
        db,
        session(u.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          labels: ["Keep", "Drop"],
        },
        sig(),
      );
      const afterFirst = await db
        .select({ updatedAt: leads.updatedAt })
        .from(leads)
        .where(eq(leads.id, lead.id));
      const stamp = afterFirst[0]?.updatedAt;
      if (stamp === undefined) throw new Error("setup failed");
      await updateLead(
        db,
        session(u.id),
        { leadId: lead.id, expectedUpdatedAt: stamp.toISOString(), labels: ["Keep"] },
        sig(),
      );

      expect(await linkedNames(db, leadLabels, leadLabels.leadId, lead.id)).toEqual(["Keep"]);
    });
  });

  it("links labels applied through a bulk lead edit", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const [lead] = await db
        .insert(leads)
        .values({ title: "L", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      if (lead === undefined) throw new Error("setup failed");

      await bulkUpdateLeads(
        db,
        session(u.id),
        { ids: [lead.id], change: { labels: ["Bulked"] } },
        sig(),
      );

      expect(await linkedNames(db, leadLabels, leadLabels.leadId, lead.id)).toEqual(["Bulked"]);
    });
  });

  it("links labels applied when a deal is created and when it is updated", async () => {
    await withTestDb(async (db) => {
      const { deal, u } = await setupDeal(db);

      await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          labels: ["Hot", "Renewal"],
        },
        sig(),
      );

      expect(await linkedNames(db, dealLabels, dealLabels.dealId, deal.id)).toEqual([
        "Hot",
        "Renewal",
      ]);
    });
  });

  it("links the labels carried onto the deal when a lead is converted", async () => {
    await withTestDb(async (db) => {
      const { u, p } = await setupDeal(db);
      const stage = p.stages[0];
      if (stage === undefined) throw new Error("setup failed");
      const [lead] = await db
        .insert(leads)
        .values({
          title: "Convertible",
          ownerId: u.id,
          visibilityLevel: "all",
          labels: ["carried"],
        })
        .returning();
      if (lead === undefined) throw new Error("setup failed");

      const converted = await convertLead(
        db,
        session(u.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          pipelineId: p.pipeline.id,
        },
        sig(),
      );
      if (!converted.ok) throw new Error(`convertLead failed: ${converted.error.message}`);

      expect(await linkedNames(db, dealLabels, dealLabels.dealId, converted.value.dealId)).toEqual([
        "carried",
      ]);
    });
  });

  it("links labels applied to a person", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Pat", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined) throw new Error("setup failed");

      await updatePerson(db, contactActor(u.id), { id: person.id, labels: ["Champion"] }, sig());

      expect(await linkedNames(db, personLabels, personLabels.personId, person.id)).toEqual([
        "Champion",
      ]);
    });
  });

  it("links labels applied to an organization", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const [org] = await db
        .insert(organizations)
        .values({ name: "Acme", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      if (org === undefined) throw new Error("setup failed");

      await updateOrg(db, contactActor(u.id), { id: org.id, labels: ["Enterprise"] }, sig());

      expect(await linkedNames(db, orgLabels, orgLabels.orgId, org.id)).toEqual(["Enterprise"]);
    });
  });
});
