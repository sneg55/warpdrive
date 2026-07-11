// In-app preference enforcement: a user who disables inApp for a type must NOT see
// notifications of that type in getFeed or getUnreadCount.
import { describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getFeed, getUnreadCount } from "./feed";
import { setPreference } from "./preferences";

function toAuthUser(row: Awaited<ReturnType<typeof seedUser>>): AuthUser {
  return {
    id: row.id,
    type: row.isAdmin ? "admin" : "regular",
    isActive: row.isActive,
    groupIds: new Set<string>(),
  };
}

describe("notification feed in-app preference filtering", () => {
  it("hides a notification whose type the user disabled in-app, while showing an enabled type", async () => {
    await withTestDb(async (db) => {
      const aliceRow = await seedUser(db);
      const alice = toAuthUser(aliceRow);

      // Insert two notifications with no entity gating (null-entity, always pass visibility).
      // Type 'mention' will be disabled in-app. Type 'deal_won' stays at default (inApp=true).
      await db.insert(notifications).values([
        {
          userId: alice.id,
          type: "mention",
          entityType: null,
          entityId: null,
          actorId: null,
          payload: { note: "should be hidden" },
        },
        {
          userId: alice.id,
          type: "deal_won",
          entityType: null,
          entityId: null,
          actorId: null,
          payload: { note: "should be visible" },
        },
      ]);

      const ctrl = new AbortController();

      // Disable in-app for 'mention'.
      await setPreference(db, alice.id, "mention", { inApp: false, email: false }, ctrl.signal);

      // RED: before the preference filter is enforced, both notifications appear.
      // After the fix (GREEN), only 'deal_won' should appear.
      const feed = await getFeed(db, alice, 50, ctrl.signal);
      const types = feed.map((n) => n.type);

      // 'deal_won' must appear (inApp default = true).
      expect(types).toContain("deal_won");
      // 'mention' must NOT appear (inApp explicitly set to false).
      expect(types).not.toContain("mention");

      // Unread count: only the enabled type is counted.
      const count = await getUnreadCount(db, alice, ctrl.signal);
      expect(count).toBe(1);
    });
  });

  it("shows all notifications when no in-app preferences are set (default inApp=true)", async () => {
    await withTestDb(async (db) => {
      const aliceRow = await seedUser(db);
      const alice = toAuthUser(aliceRow);

      // No preference rows inserted: defaults apply (inApp=true for all types).
      await db.insert(notifications).values([
        {
          userId: alice.id,
          type: "mention",
          entityType: null,
          entityId: null,
          actorId: null,
          payload: {},
        },
        {
          userId: alice.id,
          type: "deal_won",
          entityType: null,
          entityId: null,
          actorId: null,
          payload: {},
        },
      ]);

      const ctrl = new AbortController();
      const feed = await getFeed(db, alice, 50, ctrl.signal);
      const types = feed.map((n) => n.type);

      expect(types).toContain("mention");
      expect(types).toContain("deal_won");
      expect(await getUnreadCount(db, alice, ctrl.signal)).toBe(2);
    });
  });
});
