import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { seedPipelineWithStages } from "@/db/testing/factories";
import { sessionFixture } from "@/features/auth/session.test-helpers";
import { makeTestDb, type TestDb } from "@/test/db";
import {
  activities,
  activityTypes,
  deals,
  leads,
  permissionSets,
  sessions,
  settings,
  users,
  visibilityGroupMembers,
  visibilityGroups,
} from "./index";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

describe("identity schema", () => {
  test("can insert a permission set, a user, and a session", async () => {
    const [ps] = await h.db
      .insert(permissionSets)
      .values({ name: "Regular", flags: { "deal.create": true }, isDefault: true })
      .returning();
    const [u] = await h.db
      .insert(users)
      .values({
        email: "a@example.com",
        name: "A",
        googleSub: "sub-1",
        isAdmin: false,
        permissionSetId: ps!.id,
      })
      .returning();
    expect(u!.isActive).toBe(true);
    const [s] = await h.db
      .insert(sessions)
      .values(sessionFixture({ userId: u!.id, expiresAt: new Date(Date.now() + 3_600_000) }))
      .returning();
    expect(s!.revokedAt).toBeNull();
  });

  test("group membership composite PK rejects duplicates", async () => {
    const [g] = await h.db.insert(visibilityGroups).values({ name: "Everyone" }).returning();
    const [u] = await h.db
      .insert(users)
      .values({ email: "b@example.com", name: "B", googleSub: "sub-2" })
      .returning();
    await h.db.insert(visibilityGroupMembers).values({ groupId: g!.id, userId: u!.id });
    await expect(
      h.db.insert(visibilityGroupMembers).values({ groupId: g!.id, userId: u!.id }),
    ).rejects.toThrow();
  });

  test("settings singleton CHECK id=true rejects a second row", async () => {
    await h.db.insert(settings).values({ baseCurrency: "USD" });
    await expect(
      h.db.execute(sql`INSERT INTO settings (id, base_currency) VALUES (false, 'USD')`),
    ).rejects.toThrow();
  });

  test("email is unique (citext) and case-insensitive", async () => {
    await h.db.insert(users).values({ email: "Case@example.com", name: "C", googleSub: "sub-3" });
    await expect(
      h.db.insert(users).values({ email: "case@example.com", name: "C2", googleSub: "sub-4" }),
    ).rejects.toThrow();
  });
});

describe("activities single-parent constraint", () => {
  // An activity links at most one primary parent (deal XOR lead), enforced by the
  // check constraint num_nonnulls(deal_id, lead_id) <= 1.
  test("rejects a row that sets both deal_id and lead_id", async () => {
    const [u] = await h.db
      .insert(users)
      .values({
        email: `both-${Date.now()}@example.com`,
        name: "P",
        googleSub: `both-${Date.now()}`,
      })
      .returning();
    const [lead] = await h.db
      .insert(leads)
      .values({ title: "L", ownerId: u!.id, visibilityLevel: "all" })
      .returning();
    // Seed a REAL deal so the rejection is unambiguously the CHECK, not a dangling FK.
    const pipe = await seedPipelineWithStages(h.db, ["Lead"]);
    const [deal] = await h.db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: pipe.stages[0]!.id,
        ownerId: u!.id,
        visibilityLevel: "all",
      })
      .returning();
    const [type] = await h.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));

    await expect(
      h.db.insert(activities).values({
        typeId: type!.id,
        subject: "Both parents",
        ownerId: u!.id,
        assigneeId: u!.id,
        dealId: deal!.id,
        leadId: lead!.id,
      }),
      // Both FKs are valid, so the only possible violation is the single-parent CHECK.
    ).rejects.toThrow();
  });

  test("accepts a lead-only activity", async () => {
    const [u] = await h.db
      .insert(users)
      .values({
        email: `leadonly-${Date.now()}@example.com`,
        name: "P",
        googleSub: `leadonly-${Date.now()}`,
      })
      .returning();
    const [lead] = await h.db
      .insert(leads)
      .values({ title: "L2", ownerId: u!.id, visibilityLevel: "all" })
      .returning();
    const [type] = await h.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));

    const [row] = await h.db
      .insert(activities)
      .values({
        typeId: type!.id,
        subject: "Lead only",
        ownerId: u!.id,
        assigneeId: u!.id,
        leadId: lead!.id,
      })
      .returning();
    expect(row?.leadId).toBe(lead!.id);
    expect(row?.dealId).toBeNull();
  });
});
