// Integration tests for followContact / unfollowContact / listContactFollowers.
// Real Postgres, no DB mocking. Mirrors deal-workspace/followers.test.ts: self-only follow
// toggle gated on VISIBILITY (canSee), not edit, and idempotent both directions.
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { contactFollowers, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { followContact, listContactFollowers, unfollowContact } from "./followers";

function actor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

const sig = () => new AbortController().signal;

describe("followContact / unfollowContact / listContactFollowers", () => {
  it("follows and unfollows a person idempotently", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Jane", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined) throw new Error("person seed failed");
      const a = actor(owner.id);

      expect((await followContact(db, a, "person", person.id, sig())).ok).toBe(true);
      // Idempotent: a second follow by the same user is a no-op.
      expect((await followContact(db, a, "person", person.id, sig())).ok).toBe(true);

      const f1 = await listContactFollowers(db, "person", person.id, sig());
      expect(f1.map((u) => u.id)).toContain(owner.id);

      const removed = await unfollowContact(db, a, "person", person.id, sig());
      expect(removed.ok).toBe(true);

      const f2 = await listContactFollowers(db, "person", person.id, sig());
      expect(f2.map((u) => u.id)).not.toContain(owner.id);

      // Idempotent: unfollow-when-absent is also a no-op.
      const again = await unfollowContact(db, a, "person", person.id, sig());
      expect(again.ok).toBe(true);
    });
  });

  it("follows and unfollows an organization idempotently", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [org] = await db
        .insert(organizations)
        .values({ name: "Acme", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (org === undefined) throw new Error("org seed failed");
      const a = actor(owner.id);

      expect((await followContact(db, a, "organization", org.id, sig())).ok).toBe(true);
      const followers = await listContactFollowers(db, "organization", org.id, sig());
      expect(followers.map((u) => u.id)).toContain(owner.id);

      await unfollowContact(db, a, "organization", org.id, sig());
      const after = await listContactFollowers(db, "organization", org.id, sig());
      expect(after.map((u) => u.id)).not.toContain(owner.id);
    });
  });

  it("returns a not-found error and inserts no row when the actor cannot see the contact", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      // owner-level visibility: a non-owner regular actor cannot see it.
      const [person] = await db
        .insert(persons)
        .values({ name: "Hidden", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (person === undefined) throw new Error("person seed failed");

      const r = await followContact(db, actor(stranger.id), "person", person.id, sig());
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_CONTACT_001");

      const rows = await db
        .select()
        .from(contactFollowers)
        .where(
          and(
            eq(contactFollowers.entityType, "person"),
            eq(contactFollowers.entityId, person.id),
            eq(contactFollowers.userId, stranger.id),
          ),
        );
      expect(rows.length).toBe(0);
    });
  });
});
