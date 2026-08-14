import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityParticipants, emailThreads, notes } from "@/db/schema";
import { activityTypes } from "@/db/schema/activityTypes";
import { deals } from "@/db/schema/deals";
import { emailAccounts } from "@/db/schema/email";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { convertLead } from "./leadConvert";
import { insertLead, seedSettings, session, sig } from "./leadConvert.test-helpers";

// Converting a lead used to leave its whole history behind: notes hang off (entity_type='lead',
// entity_id), activities off activities.lead_id and email off email_threads.lead_id, none of which
// the deal reads. The deal now inherits all three, and the archived lead keeps its own copy.

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

// Migrations already seed the built-in types, so reuse one rather than inserting a duplicate key.
async function anyActivityType(db: TestDb): Promise<string> {
  const [row] = await db.select({ id: activityTypes.id }).from(activityTypes).limit(1);
  return row?.id ?? "";
}

// A mailbox + a thread already linked to the lead (as inbound sync would leave it).
async function seedLeadThread(db: TestDb, userId: string, leadId: string): Promise<string> {
  const [account] = await db
    .insert(emailAccounts)
    .values({ userId, emailAddress: "o@gunsnation.com", status: "connected" })
    .returning();
  const [thread] = await db
    .insert(emailThreads)
    .values({
      gmailThreadId: "t-carry",
      accountId: account?.id ?? "",
      subject: "Intro",
      leadId,
    })
    .returning();
  return thread?.id ?? "";
}

describe("convertLead carries the lead's history onto the deal", () => {
  it("copies the lead's notes to the deal and leaves the lead's own intact", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const lead = await insertLead(db, owner.id);
      await db.insert(notes).values([
        { entityType: "lead", entityId: lead.id, body: "Spoke to Steve", authorId: owner.id },
        {
          entityType: "lead",
          entityId: lead.id,
          body: "Pinned one",
          authorId: owner.id,
          pinned: true,
        },
        // Soft-deleted: must not be resurrected onto the deal.
        {
          entityType: "lead",
          entityId: lead.id,
          body: "Deleted",
          authorId: owner.id,
          deletedAt: new Date(),
        },
      ]);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;

      const onDeal = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.entityType, "deal"),
            eq(notes.entityId, r.value.dealId),
            isNull(notes.deletedAt),
          ),
        );
      expect(onDeal.map((n) => n.body).sort()).toEqual(["Pinned one", "Spoke to Steve"]);
      expect(onDeal.find((n) => n.body === "Pinned one")?.pinned).toBe(true);
      expect(onDeal.every((n) => n.authorId === owner.id)).toBe(true);

      // The archived lead keeps its own notes (copy, not move).
      const onLead = await db
        .select()
        .from(notes)
        .where(
          and(eq(notes.entityType, "lead"), eq(notes.entityId, lead.id), isNull(notes.deletedAt)),
        );
      expect(onLead).toHaveLength(2);
    });
  });

  it("copies the lead's activities onto the deal with their participants", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const mate = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const typeId = await anyActivityType(db);
      const lead = await insertLead(db, owner.id);
      const [act] = await db
        .insert(activities)
        .values({
          typeId,
          subject: "Call Steve",
          ownerId: owner.id,
          assigneeId: owner.id,
          leadId: lead.id,
          note: "ask about the feed",
        })
        .returning();
      await db
        .insert(activityParticipants)
        .values({ activityId: act?.id ?? "", userId: mate.id, role: "guest" });

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;

      const onDeal = await db
        .select()
        .from(activities)
        .where(eq(activities.dealId, r.value.dealId));
      expect(onDeal).toHaveLength(1);
      expect(onDeal[0]?.subject).toBe("Call Steve");
      expect(onDeal[0]?.note).toBe("ask about the feed");
      // activity_single_parent: the copy belongs to the deal alone.
      expect(onDeal[0]?.leadId).toBeNull();
      const parts = await db
        .select()
        .from(activityParticipants)
        .where(eq(activityParticipants.activityId, onDeal[0]?.id ?? ""));
      expect(parts.map((p) => p.userId)).toEqual([mate.id]);

      // Original still on the lead.
      const onLead = await db.select().from(activities).where(eq(activities.leadId, lead.id));
      expect(onLead).toHaveLength(1);
    });
  });

  it("links the lead's email threads to the deal without unlinking the lead", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const lead = await insertLead(db, owner.id);
      const threadId = await seedLeadThread(db, owner.id, lead.id);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;

      const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, threadId));
      // A second row is impossible (unique account_id + gmail_thread_id), so the one thread carries
      // both links and shows on the deal and the archived lead.
      expect(thread?.dealId).toBe(r.value.dealId);
      expect(thread?.leadId).toBe(lead.id);
    });
  });

  it("creates the deal even when the lead has no history to carry", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const lead = await insertLead(db, owner.id);

      const r = await convertLead(
        db,
        session(owner.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) return;
      expect(await db.select().from(deals).where(eq(deals.id, r.value.dealId))).toHaveLength(1);
    });
  });
});
