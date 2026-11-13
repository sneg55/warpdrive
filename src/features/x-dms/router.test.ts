import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { at, seedXAccount, seedXConversation, seedXMessage } from "./reads.test-helpers";
import { makeXDmsRouter } from "./router";

function callerFor(db: Db, userId: string, enabled: boolean) {
  return makeXDmsRouter(() => enabled).createCaller({
    db,
    session: { userId, sessionId: "test-session" },
    actor: {
      id: userId,
      type: "regular",
      isActive: true,
      flags: new Set(),
      groupIds: new Set<string>(),
      name: "Test User",
      email: "test@example.com",
      avatarUrl: null,
    },
  });
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof TRPCError ? `${e.code}:${e.message}` : "other";
  }
}

async function seedWorld(db: Db) {
  const member = await seedUser(db);
  const outsider = await seedUser(db, { isAdmin: true });
  const accountId = await seedXAccount(db, { members: [member.id] });
  const conversationId = await seedXConversation(db, accountId);
  await seedXMessage(db, conversationId, { direction: "inbound", at: at("2026-01-01T10:00:00Z") });
  return { member, outsider, accountId, conversationId };
}

describe("x dms router", () => {
  it("returns nothing on every surface when the feature is off", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const caller = callerFor(db, w.member.id, false);
      expect(await caller.enabled()).toBe(false);
      expect(await caller.accounts()).toEqual([]);
      expect(await caller.list({ accountId: w.accountId, view: "inbox" })).toEqual({
        rows: [],
        nextCursor: null,
      });
      expect(await caller.unreadCount({})).toBe(0);
      expect(await codeOf(caller.conversation({ conversationId: w.conversationId }))).toBe(
        "NOT_FOUND:E_X_007",
      );
      expect(await codeOf(caller.markRead({ conversationId: w.conversationId }))).toBe(
        "NOT_FOUND:E_X_007",
      );
    });
  });

  it("serves a member and answers a non-member with not found", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const caller = callerFor(db, w.member.id, true);
      expect(await caller.enabled()).toBe(true);
      expect((await caller.accounts()).map((a) => [a.id, a.unread])).toEqual([[w.accountId, 1]]);
      const list = await caller.list({ accountId: w.accountId, view: "inbox" });
      expect(list.rows.map((r) => r.id)).toEqual([w.conversationId]);
      const one = await caller.conversation({ conversationId: w.conversationId });
      expect(one.messages).toHaveLength(1);
      expect(await caller.unreadCount({})).toBe(1);
      await caller.markRead({ conversationId: w.conversationId });
      expect(await caller.unreadCount({ accountId: w.accountId })).toBe(0);
      await caller.markUnread({ conversationId: w.conversationId });
      await caller.archive({ conversationId: w.conversationId });
      expect((await caller.list({ accountId: w.accountId, view: "archived" })).rows).toHaveLength(
        1,
      );
      await caller.unarchive({ conversationId: w.conversationId });
      expect(await caller.unreadCount({})).toBe(1);
      expect(
        await codeOf(caller.list({ accountId: w.accountId, view: "inbox", cursor: "garbage" })),
      ).toBe("BAD_REQUEST:E_X_009");

      const outsider = callerFor(db, w.outsider.id, true);
      expect(await outsider.accounts()).toEqual([]);
      expect(await outsider.unreadCount({})).toBe(0);
      expect(await codeOf(outsider.list({ accountId: w.accountId, view: "inbox" }))).toBe(
        "NOT_FOUND:E_X_007",
      );
      expect(await codeOf(outsider.conversation({ conversationId: w.conversationId }))).toBe(
        "NOT_FOUND:E_X_007",
      );
      for (const op of [
        outsider.markRead,
        outsider.markUnread,
        outsider.archive,
        outsider.unarchive,
      ]) {
        expect(await codeOf(op({ conversationId: w.conversationId }))).toBe("NOT_FOUND:E_X_007");
      }
    });
  });
});
