import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes, notes } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { recordChange } from "@/features/collaboration/changeLog";
import { leadTimeline } from "./leadTimeline";

function visSession(userId: string, isAdmin = false) {
  return {
    userId,
    isAdmin,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
  };
}

const sig = () => new AbortController().signal;

describe("leadTimeline", () => {
  it("unions a seeded lead note and activity into the feed", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [lead] = await db
        .insert(leads)
        .values({ title: "L", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (lead === undefined) throw new Error("seed lead failed");

      const [note] = await db
        .insert(notes)
        .values({
          entityType: "lead",
          entityId: lead.id,
          body: "Called the prospect",
          authorId: owner.id,
        })
        .returning();
      if (note === undefined) throw new Error("seed note failed");

      const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
      const [activity] = await db
        .insert(activities)
        .values({
          typeId: type!.id,
          subject: "Follow-up call",
          dueAt: new Date(),
          ownerId: owner.id,
          assigneeId: owner.id,
          leadId: lead.id,
        })
        .returning();
      if (activity === undefined) throw new Error("seed activity failed");

      const feed = await leadTimeline(db, visSession(owner.id), lead.id, sig());
      const noteItem = feed.items.find((i) => i.kind === "note");
      const activityItem = feed.items.find((i) => i.kind === "activity");
      expect(noteItem).toBeDefined();
      expect(activityItem).toBeDefined();
      if (noteItem?.kind === "note") expect(noteItem.body).toBe("Called the prospect");
      if (activityItem?.kind === "activity")
        expect(activityItem.activity.subject).toBe("Follow-up call");
    });
  });

  it("excludes a trashed lead-linked email thread from the feed (P4)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const [lead] = await db
        .insert(leads)
        .values({ title: "L", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (lead === undefined) throw new Error("seed lead failed");
      const acct = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${owner.id}, 'o@gunsnation.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const mkThread = async (gmailId: string, trashed: boolean): Promise<void> => {
        const t = (
          await db.execute(sql`
            INSERT INTO email_threads (gmail_thread_id, account_id, lead_id, subject, last_message_at, trashed_at)
            VALUES (${gmailId}, ${acct.id}, ${lead.id}, ${gmailId}, now(), ${trashed ? sql`now()` : null})
            RETURNING id
          `)
        ).rows[0] as { id: string };
        await db.execute(sql`
          INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, subject, sent_at)
          VALUES (${t.id}, ${acct.id}, ${`${gmailId}-m`}, 'inbound', 'x@acme.com', ${gmailId}, now())
        `);
      };
      await mkThread("live", false);
      await mkThread("trashed", true);

      const feed = await leadTimeline(db, visSession(owner.id), lead.id, sig());
      expect(feed.emails.map((e) => e.subject)).toEqual(["live"]);
    });
  });

  it("includes lead change-log events in the timeline", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [lead] = await db
        .insert(leads)
        .values({ title: "L", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (lead === undefined) throw new Error("seed lead failed");

      await recordChange(
        db,
        {
          entityType: "lead",
          entityId: lead.id,
          field: "labels",
          oldValue: [],
          newValue: ["Hot"],
          actorId: owner.id,
        },
        sig(),
      );

      const feed = await leadTimeline(db, visSession(owner.id), lead.id, sig());
      expect(feed.items.some((i) => i.kind === "event")).toBe(true);
    });
  });

  it("returns an empty feed for a lead the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const [lead] = await db
        .insert(leads)
        .values({ title: "Hidden", ownerId: owner.id, visibilityLevel: "owner" })
        .returning();
      if (lead === undefined) throw new Error("seed lead failed");
      await db
        .insert(notes)
        .values({ entityType: "lead", entityId: lead.id, body: "secret", authorId: owner.id });

      const feed = await leadTimeline(db, visSession(other.id), lead.id, sig());
      expect(feed.items).toHaveLength(0);
      expect(feed.emails).toHaveLength(0);
    });
  });
});
