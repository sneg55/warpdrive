import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { customFieldDefs, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { upsertMapping } from "./mappingsRepo";
import { badgeProfiles, normaliseName } from "./prospectDedup";
import type { ProspectProfile } from "./providers/types";

const signal = new AbortController().signal;

function actorFor(id: string): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set(),
    primaryVisibilityGroupId: null,
  };
}

function profileOf(over: Partial<ProspectProfile> & { fullName: string }): ProspectProfile {
  return { providerRef: "ref-1", hasEmail: false, hasPhone: false, ...over };
}

async function seedOrg(db: Db, ownerId: string): Promise<string> {
  const [row] = await db
    .insert(organizations)
    .values({ name: `Org ${Math.random()}`, ownerId, visibilityLevel: "all" })
    .returning({ id: organizations.id });
  if (row === undefined) throw new Error("no organization row");
  return row.id;
}

async function seedPerson(
  db: Db,
  values: Omit<typeof persons.$inferInsert, "visibilityLevel"> &
    Partial<Pick<typeof persons.$inferInsert, "visibilityLevel">>,
): Promise<typeof persons.$inferSelect> {
  const [row] = await db
    .insert(persons)
    .values({ visibilityLevel: "all", ...values })
    .returning();
  if (row === undefined) throw new Error("no person row");
  return row;
}

describe("normaliseName", () => {
  it("folds case and collapses whitespace", () => {
    expect(normaliseName("  Ada   LOVELACE ")).toBe("ada lovelace");
  });

  it("collapses tabs and newlines the same way", () => {
    expect(normaliseName("Ada\t\nLovelace")).toBe("ada lovelace");
  });
});

describe("badgeProfiles", () => {
  it("badges a person at this org with the same normalised name as existing", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = actorFor(owner.id);
      const orgId = await seedOrg(db, owner.id);
      const person = await seedPerson(db, { name: "Ada  Lovelace", orgId, ownerId: owner.id });

      const badges = await badgeProfiles(
        db,
        actor,
        orgId,
        [profileOf({ fullName: "ADA LOVELACE" })],
        signal,
      );

      expect(badges).toEqual([
        {
          providerRef: "ref-1",
          match: {
            kind: "existing",
            personId: person.id,
            personUpdatedAtIso: person.updatedAt.toISOString(),
          },
        },
      ]);
    });
  });

  it("badges a person at a different organization as new", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = actorFor(owner.id);
      const orgId = await seedOrg(db, owner.id);
      const otherOrgId = await seedOrg(db, owner.id);
      await seedPerson(db, { name: "Ada Lovelace", orgId: otherOrgId, ownerId: owner.id });

      const badges = await badgeProfiles(
        db,
        actor,
        orgId,
        [profileOf({ fullName: "Ada Lovelace" })],
        signal,
      );

      expect(badges[0]?.match).toEqual({ kind: "new" });
    });
  });

  it("badges a soft-deleted person as new", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = actorFor(owner.id);
      const orgId = await seedOrg(db, owner.id);
      await seedPerson(db, {
        name: "Ada Lovelace",
        orgId,
        ownerId: owner.id,
        deletedAt: new Date(),
      });

      const badges = await badgeProfiles(
        db,
        actor,
        orgId,
        [profileOf({ fullName: "Ada Lovelace" })],
        signal,
      );

      expect(badges[0]?.match).toEqual({ kind: "new" });
    });
  });

  it("badges a person the actor cannot see as new", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const actor = actorFor(stranger.id);
      const orgId = await seedOrg(db, owner.id);
      await seedPerson(db, {
        name: "Ada Lovelace",
        orgId,
        ownerId: owner.id,
        visibilityLevel: "owner",
      });

      const badges = await badgeProfiles(
        db,
        actor,
        orgId,
        [profileOf({ fullName: "Ada Lovelace" })],
        signal,
      );

      expect(badges[0]?.match).toEqual({ kind: "new" });
    });
  });

  it("badges an ambiguous name as new", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = actorFor(owner.id);
      const orgId = await seedOrg(db, owner.id);
      await seedPerson(db, { name: "Ada Lovelace", orgId, ownerId: owner.id });
      await seedPerson(db, { name: "ada lovelace", orgId, ownerId: owner.id });

      const badges = await badgeProfiles(
        db,
        actor,
        orgId,
        [profileOf({ fullName: "Ada Lovelace" })],
        signal,
      );

      expect(badges[0]?.match).toEqual({ kind: "new" });
    });
  });

  it("prefers an exact LinkedIn match over the name", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = actorFor(owner.id);
      const orgId = await seedOrg(db, owner.id);
      const [def] = await db
        .insert(customFieldDefs)
        .values({ targetEntity: "person", type: "text", name: "LinkedIn", key: "li_url" })
        .returning({ id: customFieldDefs.id, key: customFieldDefs.key });
      if (def === undefined) throw new Error("no custom field def row");
      const mapped = await upsertMapping(
        db,
        "person",
        "person.linkedinUrl",
        { kind: "custom", fieldDefId: def.id },
        signal,
      );
      expect(mapped.ok).toBe(true);

      const byLinkedin = await seedPerson(db, {
        name: "A. Lovelace",
        orgId,
        ownerId: owner.id,
        customFields: { [def.key]: "https://linkedin.com/in/ada" },
      });
      await seedPerson(db, { name: "Ada Lovelace", orgId, ownerId: owner.id });

      const badges = await badgeProfiles(
        db,
        actor,
        orgId,
        [profileOf({ fullName: "Ada Lovelace", linkedinUrl: "https://linkedin.com/in/ada" })],
        signal,
      );

      expect(badges[0]?.match).toEqual({
        kind: "existing",
        personId: byLinkedin.id,
        personUpdatedAtIso: byLinkedin.updatedAt.toISOString(),
      });
    });
  });
});
