import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type * as schema from "@/db/schema";
import { organizations } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { addOrgRelation, listRelatedOrgs, removeOrgRelation } from "./orgRelations";

type Db = NodePgDatabase<typeof schema>;

// Defaults to contact.edit_own so existing "owner acting on their own orgs" tests keep
// working under the contact.edit gate; pass an explicit empty array to build an actor who
// can SEE a record but lacks edit capability (mirrors contactEditAuthz.test.ts's helper).
function actor(
  id: string,
  isAdmin = false,
  flags: PermissionFlagKey[] = ["contact.edit_own"],
): PermSetUser {
  return {
    id,
    type: isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags),
  };
}

const sig = () => AbortSignal.timeout(5000);

async function seedOrg(
  db: Db,
  ownerId: string,
  name: string,
  visibilityLevel: "all" | "owner" | "group" = "all",
) {
  const [org] = await db
    .insert(organizations)
    .values({ name, ownerId, visibilityLevel })
    .returning();
  if (org === undefined) throw new Error(`seed org '${name}' failed`);
  return org;
}

it("adds and lists a related organization in both directions", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const me = actor(owner.id);
    const orgA = await seedOrg(db, owner.id, "Acme");
    const orgB = await seedOrg(db, owner.id, "Beta Co");

    const r = await addOrgRelation(
      db,
      me,
      { sourceOrgId: orgA.id, targetOrgId: orgB.id, relationType: "partner" },
      sig(),
    );
    expect(r.ok).toBe(true);

    const fromA = await listRelatedOrgs(db, me, orgA.id, sig());
    const fromB = await listRelatedOrgs(db, me, orgB.id, sig());
    expect(fromA).toEqual([{ orgId: orgB.id, name: "Beta Co", relationType: "partner" }]);
    // Reverse direction is visible too: B's related-orgs list also shows A.
    expect(fromB).toEqual([{ orgId: orgA.id, name: "Acme", relationType: "partner" }]);
  });
});

it("is idempotent: adding the same relation twice does not duplicate rows", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const me = actor(owner.id);
    const orgA = await seedOrg(db, owner.id, "Acme");
    const orgB = await seedOrg(db, owner.id, "Beta Co");

    const input = { sourceOrgId: orgA.id, targetOrgId: orgB.id, relationType: "partner" };
    const r1 = await addOrgRelation(db, me, input, sig());
    const r2 = await addOrgRelation(db, me, input, sig());
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const fromA = await listRelatedOrgs(db, me, orgA.id, sig());
    expect(fromA).toHaveLength(1);
  });
});

it("rejects relating an organization to itself", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const me = actor(owner.id);
    const orgA = await seedOrg(db, owner.id, "Acme");

    const r = await addOrgRelation(
      db,
      me,
      { sourceOrgId: orgA.id, targetOrgId: orgA.id, relationType: "partner" },
      sig(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_CONTACT_005");
  });
});

it("removes a relation regardless of which side is passed as source", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const me = actor(owner.id);
    const orgA = await seedOrg(db, owner.id, "Acme");
    const orgB = await seedOrg(db, owner.id, "Beta Co");

    await addOrgRelation(
      db,
      me,
      { sourceOrgId: orgA.id, targetOrgId: orgB.id, relationType: "partner" },
      sig(),
    );

    // Pass the pair reversed from how it was stored: still removes the row.
    const r = await removeOrgRelation(
      db,
      me,
      { sourceOrgId: orgB.id, targetOrgId: orgA.id },
      sig(),
    );
    expect(r.ok).toBe(true);

    expect(await listRelatedOrgs(db, me, orgA.id, sig())).toEqual([]);
    expect(await listRelatedOrgs(db, me, orgB.id, sig())).toEqual([]);
  });
});

it("removing an absent relation is a no-op, not an error", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const me = actor(owner.id);
    const orgA = await seedOrg(db, owner.id, "Acme");
    const orgB = await seedOrg(db, owner.id, "Beta Co");

    const r = await removeOrgRelation(
      db,
      me,
      { sourceOrgId: orgA.id, targetOrgId: orgB.id },
      sig(),
    );
    expect(r.ok).toBe(true);
  });
});

it("returns CONTACT_NOT_FOUND when the target org is not visible to the actor", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const stranger = await seedUser(db);
    const me = actor(owner.id);
    const orgA = await seedOrg(db, owner.id, "Acme", "all");
    const hidden = await seedOrg(db, stranger.id, "Hidden Co", "owner");

    const r = await addOrgRelation(
      db,
      me,
      { sourceOrgId: orgA.id, targetOrgId: hidden.id, relationType: "partner" },
      sig(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_CONTACT_001");
  });
});

it("filters out a related org the actor cannot see from the list", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const stranger = await seedUser(db);
    const admin = actor(owner.id, true);
    const me = actor(owner.id);
    const orgA = await seedOrg(db, owner.id, "Acme", "all");
    const hidden = await seedOrg(db, stranger.id, "Hidden Co", "owner");

    // Admin can create the relation even though `me` (a regular actor) cannot see `hidden`.
    const r = await addOrgRelation(
      db,
      admin,
      { sourceOrgId: orgA.id, targetOrgId: hidden.id, relationType: "partner" },
      sig(),
    );
    expect(r.ok).toBe(true);

    // `me` sees org A (visibilityLevel "all") but the related "Hidden Co" row is filtered out.
    const fromA = await listRelatedOrgs(db, me, orgA.id, sig());
    expect(fromA).toEqual([]);
  });
});

it("returns an empty list for an org the actor cannot see at all", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const stranger = await seedUser(db);
    const strangerActor = actor(stranger.id);
    const hidden = await seedOrg(db, owner.id, "Hidden Co", "owner");

    const r = await listRelatedOrgs(
      db,
      hidden.id ? strangerActor : strangerActor,
      hidden.id,
      sig(),
    );
    expect(r).toEqual([]);
  });
});

// Important finding 1 (Task 23 review): addOrgRelation only deduped the exact ordered
// (source, target) pair via the composite PK. Nothing stopped (A,B) and (B,A) from both
// existing as distinct rows for the same org pair, which made listRelatedOrgs (asSource
// union asTarget) return the same org TWICE. Adding the reverse direction must be a no-op.
it("prevents a reverse-direction duplicate: adding (A,B) then (B,A) yields one entry per org", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const me = actor(owner.id);
    const orgA = await seedOrg(db, owner.id, "Acme");
    const orgB = await seedOrg(db, owner.id, "Beta Co");

    const r1 = await addOrgRelation(
      db,
      me,
      { sourceOrgId: orgA.id, targetOrgId: orgB.id, relationType: "partner" },
      sig(),
    );
    expect(r1.ok).toBe(true);

    // Reverse direction: same unordered pair, opposite source/target, different label.
    const r2 = await addOrgRelation(
      db,
      me,
      { sourceOrgId: orgB.id, targetOrgId: orgA.id, relationType: "subsidiary" },
      sig(),
    );
    expect(r2.ok).toBe(true);

    const fromA = await listRelatedOrgs(db, me, orgA.id, sig());
    const fromB = await listRelatedOrgs(db, me, orgB.id, sig());
    expect(fromA).toHaveLength(1);
    expect(fromB).toHaveLength(1);
    // The first-written label wins; the no-op reverse insert does not overwrite it.
    expect(fromA[0]?.relationType).toBe("partner");
  });
});

// Important finding 2 (Task 23 review): add/remove were gated on canSee only. A relation is
// shared, org-wide-visible data (unlike dealFollowers' self-scoped opt-in), so mutating it
// should require contact.edit on the source org, mirroring updateOrg/deleteOrg's gate.
it("denies add/remove to an actor who can see both orgs but lacks contact.edit", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const stranger = await seedUser(db);
    const me = actor(owner.id);
    const noEdit = actor(stranger.id, false, []);
    const orgA = await seedOrg(db, owner.id, "Acme", "all");
    const orgB = await seedOrg(db, owner.id, "Beta Co", "all");

    // Pre-seed a relation as the owner so removal has a real row to act on.
    const seeded = await addOrgRelation(
      db,
      me,
      { sourceOrgId: orgA.id, targetOrgId: orgB.id, relationType: "partner" },
      sig(),
    );
    expect(seeded.ok).toBe(true);

    // `noEdit` can see both orgs (visibilityLevel "all") but holds no contact.edit flag.
    const addResult = await addOrgRelation(
      db,
      noEdit,
      { sourceOrgId: orgA.id, targetOrgId: orgB.id, relationType: "vendor" },
      sig(),
    );
    expect(addResult.ok).toBe(false);
    if (!addResult.ok) expect(addResult.error.id).toBe("E_PERM_001");

    const removeResult = await removeOrgRelation(
      db,
      noEdit,
      { sourceOrgId: orgA.id, targetOrgId: orgB.id },
      sig(),
    );
    expect(removeResult.ok).toBe(false);
    if (!removeResult.ok) expect(removeResult.error.id).toBe("E_PERM_001");

    // Neither call actually mutated anything: the seeded relation is untouched.
    expect(await listRelatedOrgs(db, me, orgA.id, sig())).toHaveLength(1);
  });
});
