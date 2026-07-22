import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { archiveDef, createDef } from "@/features/custom-fields/defsRepo";
import { patchContactCustomField } from "./contactCustomFieldPatch";
import type { ContactActor } from "./personsRepo";

function actor(id: string, flags: PermissionFlagKey[] = ["contact.edit_own"]): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags),
    primaryVisibilityGroupId: null,
  };
}

describe("patchContactCustomField", () => {
  it("preserves archived values when an active person field is edited", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const active = await createDef(
        db,
        { targetEntity: "person", type: "text", name: "Role" },
        signal,
      );
      const archived = await createDef(
        db,
        { targetEntity: "person", type: "text", name: "Legacy code" },
        signal,
      );
      if (!active.ok || !archived.ok) throw new Error("field setup failed");
      const archivedResult = await archiveDef(db, archived.value.id, signal);
      if (!archivedResult.ok) throw archivedResult.error;

      const [person] = await db
        .insert(persons)
        .values({
          name: "Ada",
          ownerId: owner.id,
          visibilityLevel: "owner",
          customFields: { role: "Buyer", legacy_code: "keep-me" },
        })
        .returning();
      if (person === undefined) throw new Error("person setup failed");

      const result = await patchContactCustomField(
        db,
        actor(owner.id),
        { entity: "person", id: person.id, key: "role", value: "Champion" },
        signal,
      );
      expect(result.ok).toBe(true);

      const [saved] = await db.select().from(persons).where(eq(persons.id, person.id));
      expect(saved?.customFields).toEqual({ role: "Champion", legacy_code: "keep-me" });
    });
  });

  it("composes overlapping organization field patches without losing either value", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const first = await createDef(
        db,
        { targetEntity: "organization", type: "text", name: "Tier" },
        signal,
      );
      const second = await createDef(
        db,
        { targetEntity: "organization", type: "text", name: "Region code" },
        signal,
      );
      if (!first.ok || !second.ok) throw new Error("field setup failed");

      const [org] = await db
        .insert(organizations)
        .values({
          name: "Acme",
          ownerId: owner.id,
          visibilityLevel: "owner",
          customFields: {},
        })
        .returning();
      if (org === undefined) throw new Error("organization setup failed");

      const [tier, region] = await Promise.all([
        patchContactCustomField(
          db,
          actor(owner.id),
          { entity: "organization", id: org.id, key: "tier", value: "Enterprise" },
          signal,
        ),
        patchContactCustomField(
          db,
          actor(owner.id),
          { entity: "organization", id: org.id, key: "region_code", value: "NA" },
          signal,
        ),
      ]);
      expect(tier.ok).toBe(true);
      expect(region.ok).toBe(true);

      const [saved] = await db.select().from(organizations).where(eq(organizations.id, org.id));
      expect(saved?.customFields).toEqual({ tier: "Enterprise", region_code: "NA" });
    });
  });
});
