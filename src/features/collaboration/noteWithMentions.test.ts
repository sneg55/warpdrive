import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mentions, notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { createNoteWithMentions } from "./noteWithMentions";

function actorFor(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}

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

describe("createNoteWithMentions", () => {
  it("fires a mention notification when the mentioned user can see the deal", async () => {
    await withTestDb(async (db) => {
      const author = await seedUser(db);
      const mentioned = await seedUser(db);
      // all-visibility deal: both author and mentioned user can see it
      const dealId = await seedDeal(db, author.id, "all");
      const signal = new AbortController().signal;

      const r = await createNoteWithMentions(
        db,
        actorFor(author.id),
        {
          entityType: "deal",
          entityId: dealId,
          body: `hello @[${mentioned.name}](${mentioned.id})`,
          pinned: false,
        },
        signal,
      );

      expect(r.ok).toBe(true);

      // A mentions row must exist for the mentioned user.
      const mentionRows = await db
        .select()
        .from(mentions)
        .where(sql`mentioned_user_id = ${mentioned.id}::uuid`);
      expect(mentionRows).toHaveLength(1);

      // A notification of type 'mention' must exist for the mentioned user.
      const notifRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${mentioned.id}::uuid`);
      expect(notifRows).toHaveLength(1);
      expect(notifRows[0]?.type).toBe("mention");
      expect(notifRows[0]?.entityType).toBe("deal");
      expect(notifRows[0]?.entityId).toBe(dealId);
    });
  });

  it("creates no notification when the mentioned user cannot see the deal (visibility suppression)", async () => {
    await withTestDb(async (db) => {
      const author = await seedUser(db);
      const mentioned = await seedUser(db);
      // owner-level deal: only author can see it, mentioned user CANNOT
      const dealId = await seedDeal(db, author.id, "owner");
      const signal = new AbortController().signal;

      const r = await createNoteWithMentions(
        db,
        actorFor(author.id),
        {
          entityType: "deal",
          entityId: dealId,
          body: `secret @[${mentioned.name}](${mentioned.id})`,
          pinned: false,
        },
        signal,
      );

      // Note creation must succeed.
      expect(r.ok).toBe(true);

      // NO notification row for the mentioned user (visibility suppressed it).
      const notifRows = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${mentioned.id}::uuid`);
      expect(notifRows).toHaveLength(0);
    });
  });

  it("succeeds with no mention rows and no notifications when body has no @mention tokens", async () => {
    await withTestDb(async (db) => {
      const author = await seedUser(db);
      const dealId = await seedDeal(db, author.id, "all");
      const signal = new AbortController().signal;

      const r = await createNoteWithMentions(
        db,
        actorFor(author.id),
        {
          entityType: "deal",
          entityId: dealId,
          body: "plain note without any mentions",
          pinned: false,
        },
        signal,
      );

      expect(r.ok).toBe(true);

      const mentionRows = await db.select().from(mentions);
      expect(mentionRows).toHaveLength(0);

      const notifRows = await db.select().from(notifications);
      expect(notifRows).toHaveLength(0);
    });
  });
});
