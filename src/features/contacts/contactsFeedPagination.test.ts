import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { contactsFeed } from "./contactsFeed";

function actor(id: string): PermSetUser {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
}

const sig = () => new AbortController().signal;

async function callTypeId(db: Parameters<Parameters<typeof withTestDb>[0]>[0]): Promise<string> {
  const [t] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (t === undefined) throw new Error("activity type 'call' not seeded");
  return t.id;
}

describe("contactsFeed pagination", () => {
  it("advances past rows that share the exact same due_at at a page boundary (compound cursor)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const typeId = await callTypeId(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Tied Person", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined) throw new Error("seed failed");

      const tiedDueAt = new Date("2026-07-02T10:00:00.000Z");
      for (const subject of ["Tied A", "Tied B"]) {
        await db.insert(activities).values({
          typeId,
          subject,
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: person.id,
          dueAt: tiedDueAt,
        });
      }
      await db.insert(activities).values({
        typeId,
        subject: "Older, untied",
        ownerId: owner.id,
        assigneeId: owner.id,
        personId: person.id,
        dueAt: new Date("2026-07-01T10:00:00.000Z"),
      });

      const seen: string[] = [];
      let before: string | null = null;
      let beforeId: string | null = null;
      let pageCount = 0;
      while (pageCount < 5) {
        const page = await contactsFeed(db, actor(owner.id), { limit: 1, before, beforeId }, sig());
        pageCount++;
        if (page.length === 0) break;
        seen.push(...page.map((r) => r.subject));
        const last = page[page.length - 1]!;
        before = last.dueAtIso;
        beforeId = last.id;
      }

      expect(seen).toHaveLength(3);
      expect(new Set(seen).size).toBe(3);
      expect(new Set(seen.slice(0, 2))).toEqual(new Set(["Tied A", "Tied B"]));
      expect(seen[2]).toBe("Older, untied");
      expect(pageCount).toBe(4);
    });
  });

  it("surfaces older visible rows via over-fetch when the newest raw window is mostly invisible", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const restrictedActor = await seedUser(db);
      const typeId = await callTypeId(db);

      const [hiddenPerson] = await db
        .insert(persons)
        .values({ name: "Hidden Prolific", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      const [visiblePerson] = await db
        .insert(persons)
        .values({ name: "Visible Sparse", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (hiddenPerson === undefined || visiblePerson === undefined) {
        throw new Error("seed failed");
      }

      for (let i = 0; i < 5; i++) {
        await db.insert(activities).values({
          typeId,
          subject: `Hidden ${i}`,
          ownerId: owner.id,
          assigneeId: owner.id,
          personId: hiddenPerson.id,
          dueAt: new Date(`2026-07-1${5 - i}T10:00:00.000Z`),
        });
      }
      await db.insert(activities).values({
        typeId,
        subject: "Visible newer",
        ownerId: owner.id,
        assigneeId: owner.id,
        personId: visiblePerson.id,
        dueAt: new Date("2026-07-05T10:00:00.000Z"),
      });
      await db.insert(activities).values({
        typeId,
        subject: "Visible older",
        ownerId: owner.id,
        assigneeId: owner.id,
        personId: visiblePerson.id,
        dueAt: new Date("2026-07-04T10:00:00.000Z"),
      });

      const page1 = await contactsFeed(db, actor(restrictedActor.id), { limit: 1 }, sig());
      expect(page1.map((r) => r.subject)).toEqual(["Visible newer"]);

      const page2 = await contactsFeed(
        db,
        actor(restrictedActor.id),
        { limit: 1, before: page1[0]!.dueAtIso, beforeId: page1[0]!.id },
        sig(),
      );
      expect(page2.map((r) => r.subject)).toEqual(["Visible older"]);

      const page3 = await contactsFeed(
        db,
        actor(restrictedActor.id),
        { limit: 1, before: page2[0]!.dueAtIso, beforeId: page2[0]!.id },
        sig(),
      );
      expect(page3).toEqual([]);
    });
  });
});
