// getLeadRelations: loads the full linked person + organization records for the lead sidebar's
// Person/Organization blocks (PD parity: the lead surfaces the contact's whole field set, not just
// the name). Soft-deleted contacts are treated as absent so the sidebar never renders a dangling
// link, mirroring the deal workspace's summaryRepo.
import { describe, expect, it } from "vitest";
import { leads } from "@/db/schema/leads";
import { organizations } from "@/db/schema/organizations";
import { persons } from "@/db/schema/persons";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getLeadRelations } from "./leadRepo";

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

describe("getLeadRelations", () => {
  it("loads the full linked person and organization records", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [org] = await db
        .insert(organizations)
        .values({
          name: "Acme Corp",
          ownerId: owner.id,
          visibilityLevel: "all",
          domain: "acme.com",
        })
        .returning();
      const [person] = await db
        .insert(persons)
        .values({
          name: "Jane Roe",
          ownerId: owner.id,
          visibilityLevel: "all",
          primaryEmail: "jane@acme.com",
        })
        .returning();
      if (org === undefined || person === undefined) throw new Error("seed failed");
      const lead = await insertLead(db, owner.id, { personId: person.id, orgId: org.id });

      const rel = await getLeadRelations(db, lead, sig());
      expect(rel.org?.id).toBe(org.id);
      expect(rel.org?.domain).toBe("acme.com");
      expect(rel.person?.id).toBe(person.id);
      expect(rel.person?.primaryEmail).toBe("jane@acme.com");
    });
  });

  it("returns null relations for an unlinked lead", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const lead = await insertLead(db, owner.id, { personId: null, orgId: null });
      const rel = await getLeadRelations(db, lead, sig());
      expect(rel.person).toBeNull();
      expect(rel.org).toBeNull();
    });
  });

  it("treats a soft-deleted org/person as absent (no dangling links)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [org] = await db
        .insert(organizations)
        .values({
          name: "Gone Corp",
          ownerId: owner.id,
          visibilityLevel: "all",
          deletedAt: new Date(),
        })
        .returning();
      const [person] = await db
        .insert(persons)
        .values({ name: "Ghost", ownerId: owner.id, visibilityLevel: "all", deletedAt: new Date() })
        .returning();
      if (org === undefined || person === undefined) throw new Error("seed failed");
      const lead = await insertLead(db, owner.id, { personId: person.id, orgId: org.id });

      const rel = await getLeadRelations(db, lead, sig());
      expect(rel.person).toBeNull();
      expect(rel.org).toBeNull();
    });
  });
});
