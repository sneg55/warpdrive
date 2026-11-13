import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  archiveXConversation,
  markXConversationRead,
  markXConversationUnread,
  unarchiveXConversation,
  xUnreadCount,
} from "./readState";
import { listXAccountsForActor, listXConversations } from "./reads";
import {
  at,
  removeMember,
  seedXAccount,
  seedXConversation,
  seedXMessage,
  sig,
} from "./reads.test-helpers";

async function unreadFlags(db: Db, actorId: string, accountId: string, view: "inbox" | "archived") {
  const r = await listXConversations(db, { actorId, accountId, view }, sig());
  if (!r.ok) throw r.error;
  return r.value.rows.map((row) => [row.id, row.unread]);
}

describe("x dm read state", () => {
  it("read by one member is read for another", async () => {
    await withTestDb(async (db) => {
      const first = await seedUser(db);
      const second = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [first.id, second.id] });
      const id = await seedXConversation(db, accountId);
      await seedXMessage(db, id, { direction: "inbound", at: at("2026-01-01T10:00:00Z") });
      expect(await unreadFlags(db, second.id, accountId, "inbox")).toEqual([[id, true]]);
      expect(
        (await markXConversationRead(db, { actorId: first.id, conversationId: id }, sig())).ok,
      ).toBe(true);
      expect(await unreadFlags(db, second.id, accountId, "inbox")).toEqual([[id, false]]);
      expect(await xUnreadCount(db, { actorId: second.id }, sig())).toBe(0);
      expect(
        (await markXConversationUnread(db, { actorId: second.id, conversationId: id }, sig())).ok,
      ).toBe(true);
      expect(await unreadFlags(db, first.id, accountId, "inbox")).toEqual([[id, true]]);
    });
  });

  it("own outbound reply does not make it unread", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [member.id] });
      const id = await seedXConversation(db, accountId);
      await seedXMessage(db, id, { direction: "inbound", at: at("2026-01-01T10:00:00Z") });
      await markXConversationRead(db, { actorId: member.id, conversationId: id }, sig());
      await seedXMessage(db, id, {
        direction: "outbound",
        at: new Date(Date.now() + 60_000),
        sentByUserId: member.id,
      });
      expect(await unreadFlags(db, member.id, accountId, "inbox")).toEqual([[id, false]]);
      expect(await xUnreadCount(db, { actorId: member.id, accountId }, sig())).toBe(0);
    });
  });

  it("unread count sums only member accounts", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const other = await seedUser(db);
      const a = await seedXAccount(db, { members: [member.id], displayName: "Alpha" });
      const b = await seedXAccount(db, { members: [member.id, other.id], displayName: "Beta" });
      const hidden = await seedXAccount(db, { members: [other.id] });
      for (const accountId of [a, a, b, hidden, hidden]) {
        const id = await seedXConversation(db, accountId);
        await seedXMessage(db, id, { direction: "inbound", at: at("2026-01-01T10:00:00Z") });
      }
      const quiet = await seedXConversation(db, a);
      await seedXMessage(db, quiet, { direction: "outbound", at: at("2026-01-01T10:00:00Z") });
      expect(await xUnreadCount(db, { actorId: member.id }, sig())).toBe(3);
      expect(await xUnreadCount(db, { actorId: member.id, accountId: a }, sig())).toBe(2);
      expect(await xUnreadCount(db, { actorId: member.id, accountId: hidden }, sig())).toBe(0);
      expect(await listXAccountsForActor(db, member.id, sig())).toEqual([
        expect.objectContaining({ id: a, displayName: "Alpha", unread: 2 }),
        expect.objectContaining({ id: b, displayName: "Beta", unread: 1 }),
      ]);
    });
  });

  it("archive hides the row from inbox view and count", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [member.id] });
      const id = await seedXConversation(db, accountId);
      await seedXMessage(db, id, { direction: "inbound", at: at("2026-01-01T10:00:00Z") });
      const args = { actorId: member.id, conversationId: id };
      expect((await archiveXConversation(db, args, sig())).ok).toBe(true);
      expect(await unreadFlags(db, member.id, accountId, "inbox")).toEqual([]);
      expect(await unreadFlags(db, member.id, accountId, "archived")).toEqual([[id, true]]);
      expect(await xUnreadCount(db, { actorId: member.id }, sig())).toBe(0);
      expect((await unarchiveXConversation(db, args, sig())).ok).toBe(true);
      expect(await unreadFlags(db, member.id, accountId, "inbox")).toEqual([[id, true]]);
      expect(await unreadFlags(db, member.id, accountId, "archived")).toEqual([]);
    });
  });

  it("publishes to every member channel and refuses a removed member", async () => {
    await withTestDb(async (db) => {
      const first = await seedUser(db);
      const second = await seedUser(db);
      const outsider = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [first.id, second.id] });
      const id = await seedXConversation(db, accountId);
      await seedXMessage(db, id, { direction: "inbound", at: at("2026-01-01T10:00:00Z") });
      const args = { actorId: first.id, conversationId: id };
      await markXConversationRead(db, args, sig());
      await markXConversationUnread(db, args, sig());
      await archiveXConversation(db, args, sig());
      await unarchiveXConversation(db, args, sig());
      const versions = (
        await db.execute(sql`SELECT channel, version::int FROM channel_versions ORDER BY channel`)
      ).rows;
      expect(versions).toEqual(
        [first.id, second.id].sort().map((u) => ({ channel: `user:${u}`, version: 4 })),
      );
      const denied = await markXConversationRead(
        db,
        { actorId: outsider.id, conversationId: id },
        sig(),
      );
      expect(denied.ok ? null : denied.error.id).toBe("E_X_007");
      await removeMember(db, accountId, second.id);
      for (const op of [
        markXConversationRead,
        markXConversationUnread,
        archiveXConversation,
        unarchiveXConversation,
      ]) {
        const r = await op(db, { actorId: second.id, conversationId: id }, sig());
        expect(r.ok ? null : r.error.id).toBe("E_X_007");
      }
      const row = (
        await db.execute(sql`SELECT team_read_at, archived_at FROM x_conversations WHERE id=${id}`)
      ).rows[0];
      expect(row).toEqual({ team_read_at: null, archived_at: null });
    });
  });
});
