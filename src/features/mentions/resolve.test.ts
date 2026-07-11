import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mentions, notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { resolveAndStoreMentions } from "./resolve";

// Insert a deal with the given visibility level owned by ownerId.
async function seedDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
  visibilityLevel: "all" | "owner",
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Test Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, ${visibilityLevel})
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedDeal: insert returned no rows");
  return row.id;
}

describe("resolveAndStoreMentions", () => {
  it("stores a mention row and creates a notification for a visible mentioned user", async () => {
    await withTestDb(async (db) => {
      const author = await seedUser(db);
      const target = await seedUser(db);
      // all-visibility deal: target CAN see it
      const dealId = await seedDeal(db, author.id, "all");
      const sig = new AbortController().signal;

      const r = await resolveAndStoreMentions(db, {
        source: "note",
        sourceId: "22222222-2222-2222-2222-222222222222",
        body: `hi @[T](${target.id})`,
        authorId: author.id,
        entityType: "deal",
        entityId: dealId,
        signal: sig,
      });

      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.created).toBe(1);

      // Assert the mentions row was stored.
      const mentionRows = await db
        .select()
        .from(mentions)
        .where(sql`mentioned_user_id = ${target.id}::uuid`);
      expect(mentionRows).toHaveLength(1);

      // Assert a notification was actually created.
      const notifRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${target.id}::uuid`);
      expect(notifRows).toHaveLength(1);
      expect(notifRows[0]?.type).toBe("mention");
    });
  });

  it("does not store a self-mention and creates no notification", async () => {
    await withTestDb(async (db) => {
      const author = await seedUser(db);
      const dealId = await seedDeal(db, author.id, "all");
      const sig = new AbortController().signal;

      const r = await resolveAndStoreMentions(db, {
        source: "note",
        sourceId: "33333333-3333-3333-3333-333333333333",
        body: `note to self @[Me](${author.id})`,
        authorId: author.id,
        entityType: "deal",
        entityId: dealId,
        signal: sig,
      });

      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.created).toBe(0);

      const mentionRows = await db
        .select()
        .from(mentions)
        .where(sql`mentioned_user_id = ${author.id}::uuid`);
      expect(mentionRows).toHaveLength(0);
    });
  });

  it("silently ignores a userId that does not exist in the users table", async () => {
    await withTestDb(async (db) => {
      const author = await seedUser(db);
      const dealId = await seedDeal(db, author.id, "all");
      const sig = new AbortController().signal;

      // UUID that does not exist in the database.
      const ghostId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

      const r = await resolveAndStoreMentions(db, {
        source: "note",
        sourceId: "44444444-4444-4444-4444-444444444444",
        body: `hey @[Ghost](${ghostId})`,
        authorId: author.id,
        entityType: "deal",
        entityId: dealId,
        signal: sig,
      });

      // Must succeed (not error) and report 0 created.
      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.created).toBe(0);

      const mentionRows = await db
        .select()
        .from(mentions)
        .where(sql`mentioned_user_id = ${ghostId}::uuid`);
      expect(mentionRows).toHaveLength(0);
    });
  });

  it("does not store a mention row or notify an INACTIVE mentioned user", async () => {
    await withTestDb(async (db) => {
      const author = await seedUser(db);
      const inactive = await seedUser(db, { isActive: false });
      // all-visibility deal: inactive user could otherwise see it
      const dealId = await seedDeal(db, author.id, "all");
      const sig = new AbortController().signal;

      const r = await resolveAndStoreMentions(db, {
        source: "note",
        sourceId: "66666666-6666-6666-6666-666666666666",
        body: `hey @[Inactive](${inactive.id})`,
        authorId: author.id,
        entityType: "deal",
        entityId: dealId,
        signal: sig,
      });

      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.created).toBe(0);

      // No mention row for an inactive user.
      const mentionRows = await db
        .select()
        .from(mentions)
        .where(sql`mentioned_user_id = ${inactive.id}::uuid`);
      expect(mentionRows).toHaveLength(0);

      // No notification either.
      const notifRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${inactive.id}::uuid`);
      expect(notifRows).toHaveLength(0);
    });
  });

  it("SECURITY: does not create a notification when the mentioned user cannot see the entity", async () => {
    await withTestDb(async (db) => {
      const author = await seedUser(db);
      const target = await seedUser(db);
      // owner-level visibility: only author can see this deal, target CANNOT
      const dealId = await seedDeal(db, author.id, "owner");
      const sig = new AbortController().signal;

      const r = await resolveAndStoreMentions(db, {
        source: "note",
        sourceId: "55555555-5555-5555-5555-555555555555",
        body: `hey @[Target](${target.id})`,
        authorId: author.id,
        entityType: "deal",
        entityId: dealId,
        signal: sig,
      });

      // resolveAndStoreMentions reports 0 created (the fanOut suppressed the notification).
      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.created).toBe(0);

      // The mentions row IS stored (we record the intent) but NO notification row exists.
      const mentionRows = await db
        .select()
        .from(mentions)
        .where(sql`mentioned_user_id = ${target.id}::uuid`);
      expect(mentionRows).toHaveLength(1);

      // SECURITY assertion: zero notification rows for the target.
      const notifRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${target.id}::uuid`);
      expect(notifRows).toHaveLength(0);
    });
  });
});
