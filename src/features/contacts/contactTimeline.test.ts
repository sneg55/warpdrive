import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes, notes, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { recordChange } from "@/features/collaboration/changeLog";
import type { PermSetUser } from "@/features/permissions/effective";
import { contactTimeline } from "./contactTimeline";

function actor(id: string, isAdmin = false): PermSetUser {
  return {
    id,
    type: isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
}

const sig = () => new AbortController().signal;

describe("contactTimeline", () => {
  it("merges activities, notes, and change events for a person", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Jane", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined) throw new Error("person seed failed");

      await db
        .insert(notes)
        .values({ entityType: "person", entityId: person.id, body: "Called", authorId: owner.id });

      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
      if (type === undefined) throw new Error("activity type 'call' not found");
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Follow-up call",
        ownerId: owner.id,
        assigneeId: owner.id,
        personId: person.id,
        dueAt: new Date(),
      });

      await recordChange(
        db,
        {
          entityType: "person",
          entityId: person.id,
          field: "name",
          oldValue: "Old Name",
          newValue: "Jane",
          actorId: owner.id,
        },
        sig(),
      );

      const r = await contactTimeline(db, actor(owner.id), "person", person.id, sig());
      const kinds = new Set(r.items.map((i) => i.kind));
      expect(kinds.has("activity")).toBe(true);
      expect(kinds.has("note")).toBe(true);
      expect(kinds.has("event")).toBe(true);
    });
  });

  it("merges activities, notes, and change events for an organization", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [org] = await db
        .insert(organizations)
        .values({ name: "Acme", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (org === undefined) throw new Error("org seed failed");

      await db.insert(notes).values({
        entityType: "organization",
        entityId: org.id,
        body: "Met at expo",
        authorId: owner.id,
      });

      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "meeting"));
      if (type === undefined) throw new Error("activity type 'meeting' not found");
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Renewal check-in",
        ownerId: owner.id,
        assigneeId: owner.id,
        orgId: org.id,
        dueAt: new Date(),
      });

      await recordChange(
        db,
        {
          entityType: "organization",
          entityId: org.id,
          field: "name",
          oldValue: "Old Co",
          newValue: "Acme",
          actorId: owner.id,
        },
        sig(),
      );

      const r = await contactTimeline(db, actor(owner.id), "organization", org.id, sig());
      const kinds = new Set(r.items.map((i) => i.kind));
      expect(kinds.has("activity")).toBe(true);
      expect(kinds.has("note")).toBe(true);
      expect(kinds.has("event")).toBe(true);
    });
  });

  it("returns an empty feed for a contact the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Hidden", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (person === undefined) throw new Error("person seed failed");
      await db
        .insert(notes)
        .values({ entityType: "person", entityId: person.id, body: "secret", authorId: owner.id });

      const r = await contactTimeline(db, actor(other.id), "person", person.id, sig());
      expect(r.items).toHaveLength(0);
    });
  });
});
