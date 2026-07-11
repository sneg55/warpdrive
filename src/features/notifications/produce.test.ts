import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createNotification, fanOut } from "./produce";

// Seed a deal owned by the given user with owner-level visibility.
// No seedDeal factory exists; insert directly using the deals table.
async function seedOwnerDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open", "Won"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedOwnerDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Test Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'owner')
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedOwnerDeal: insert returned no rows");
  return row.id;
}

// Seed a deal with all-visibility (any authenticated user can see it).
async function seedAllVisibilityDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedAllVisibilityDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Public Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedAllVisibilityDeal: insert returned no rows");
  return row.id;
}

describe("createNotification", () => {
  it("inserts a row and returns notificationId when recipient can see the entity", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const dealId = await seedOwnerDeal(db, alice.id);
      const ctrl = new AbortController();

      const r = await createNotification(
        db,
        {
          recipientId: alice.id,
          type: "deal_followed_update",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: { title: "Test Deal" },
        },
        ctrl.signal,
      );

      expect(r.ok).toBe(true);
      if (r.ok !== true) return;
      expect("notificationId" in r.value).toBe(true);
    });
  });

  it("suppresses (no insert) when recipient cannot see the entity", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      // owner-level deal owned by alice; bob cannot see it
      const dealId = await seedOwnerDeal(db, alice.id);
      const ctrl = new AbortController();

      const r = await createNotification(
        db,
        {
          recipientId: bob.id,
          type: "deal_followed_update",
          entityType: "deal",
          entityId: dealId,
          actorId: alice.id,
          payload: { title: "Test Deal" },
        },
        ctrl.signal,
      );

      expect(r.ok).toBe(true);
      if (r.ok !== true) return;
      // Security assertion: suppressed, no row inserted
      expect(r.value).toEqual({ suppressed: true });

      const rows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(notifications)
        .where(sql`user_id = ${bob.id}::uuid`);
      expect(rows[0]?.c).toBe(0);
    });
  });

  it("suppresses when recipient is inactive", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const inactive = await seedUser(db, { isActive: false });
      const dealId = await seedOwnerDeal(db, owner.id);
      const ctrl = new AbortController();

      const r = await createNotification(
        db,
        {
          recipientId: inactive.id,
          type: "deal_followed_update",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        },
        ctrl.signal,
      );

      expect(r.ok).toBe(true);
      if (r.ok !== true) return;
      expect(r.value).toEqual({ suppressed: true });

      const rows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(notifications)
        .where(sql`user_id = ${inactive.id}::uuid`);
      expect(rows[0]?.c).toBe(0);
    });
  });

  it("inserts when entityType/entityId are null (no visibility gate)", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const ctrl = new AbortController();

      const r = await createNotification(
        db,
        {
          recipientId: user.id,
          type: "activity_reminder",
          entityType: null,
          entityId: null,
          actorId: null,
          payload: { note: "system notification" },
        },
        ctrl.signal,
      );

      expect(r.ok).toBe(true);
      if (r.ok !== true) return;
      expect("notificationId" in r.value).toBe(true);
    });
  });

  it("suppresses a gated entityType with a null entityId (never inserts unchecked)", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const ctrl = new AbortController();

      const r = await createNotification(
        db,
        {
          recipientId: user.id,
          type: "deal_followed_update",
          entityType: "deal",
          entityId: null,
          actorId: null,
          payload: {},
        },
        ctrl.signal,
      );

      expect(r.ok).toBe(true);
      if (r.ok !== true) return;
      // A gated type with no id can never pass a visibility check: suppress, never insert.
      expect(r.value).toEqual({ suppressed: true });

      const rows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(notifications)
        .where(sql`user_id = ${user.id}::uuid`);
      expect(rows[0]?.c).toBe(0);
    });
  });
});

describe("fanOut", () => {
  it("returns one Result per input and a single suppression does not abort others", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      // all-visibility deal: both alice and bob can see it
      const dealId = await seedAllVisibilityDeal(db, alice.id);
      const ctrl = new AbortController();

      const results = await fanOut(
        db,
        [
          {
            recipientId: alice.id,
            type: "deal_won",
            entityType: "deal",
            entityId: dealId,
            actorId: null,
            payload: {},
          },
          {
            recipientId: bob.id,
            type: "deal_won",
            entityType: "deal",
            entityId: dealId,
            actorId: null,
            payload: {},
          },
        ],
        ctrl.signal,
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.ok)).toBe(true);
    });
  });

  it("returns suppressed entry without aborting remaining inputs", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      // owner deal: only alice can see it, bob is suppressed
      const dealId = await seedOwnerDeal(db, alice.id);
      const ctrl = new AbortController();

      const results = await fanOut(
        db,
        [
          {
            recipientId: alice.id,
            type: "deal_won",
            entityType: "deal",
            entityId: dealId,
            actorId: null,
            payload: {},
          },
          {
            recipientId: bob.id,
            type: "deal_won",
            entityType: "deal",
            entityId: dealId,
            actorId: null,
            payload: {},
          },
        ],
        ctrl.signal,
      );

      expect(results).toHaveLength(2);
      // alice: inserted; bob: suppressed
      expect(results[0]?.ok).toBe(true);
      if (results[0]?.ok === true) expect("notificationId" in results[0].value).toBe(true);
      expect(results[1]?.ok).toBe(true);
      if (results[1]?.ok === true) expect(results[1].value).toEqual({ suppressed: true });
    });
  });
});
