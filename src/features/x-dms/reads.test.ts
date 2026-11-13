import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getXConversation, listXAccountsForActor, listXConversations } from "./reads";
import {
  at,
  removeMember,
  seedXAccount,
  seedXConversation,
  seedXMessage,
  sig,
} from "./reads.test-helpers";

const errorId = (r: { ok: boolean; error?: { id: string } }) => (r.ok ? null : r.error?.id);

describe("x dm reads", () => {
  it("non-member sees no accounts, rows or conversation", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const outsider = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [member.id] });
      const conversationId = await seedXConversation(db, accountId);
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T10:00:00Z"),
      });
      expect(await listXAccountsForActor(db, outsider.id, sig())).toEqual([]);
      const list = await listXConversations(
        db,
        { actorId: outsider.id, accountId, view: "inbox" },
        sig(),
      );
      expect(errorId(list)).toBe("E_X_007");
      const one = await getXConversation(db, { actorId: outsider.id, conversationId }, sig());
      expect(errorId(one)).toBe("E_X_007");
      const mine = await listXAccountsForActor(db, member.id, sig());
      expect(mine.map((a) => a.id)).toEqual([accountId]);
    });
  });

  it("admin non-member sees nothing", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedXAccount(db, { members: [] });
      const conversationId = await seedXConversation(db, accountId);
      expect(await listXAccountsForActor(db, admin.id, sig())).toEqual([]);
      const list = await listXConversations(
        db,
        { actorId: admin.id, accountId, view: "inbox" },
        sig(),
      );
      expect(errorId(list)).toBe("E_X_007");
      const one = await getXConversation(db, { actorId: admin.id, conversationId }, sig());
      expect(errorId(one)).toBe("E_X_007");
    });
  });

  it("removed member gets not found on the next read", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [member.id] });
      const conversationId = await seedXConversation(db, accountId);
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T10:00:00Z"),
      });
      const before = await getXConversation(db, { actorId: member.id, conversationId }, sig());
      expect(before.ok).toBe(true);
      await removeMember(db, accountId, member.id);
      const after = await getXConversation(db, { actorId: member.id, conversationId }, sig());
      expect(errorId(after)).toBe("E_X_007");
      const list = await listXConversations(
        db,
        { actorId: member.id, accountId, view: "inbox" },
        sig(),
      );
      expect(errorId(list)).toBe("E_X_007");
    });
  });

  it("a conversation with no messages is not found", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [member.id] });
      const conversationId = await seedXConversation(db, accountId);
      const one = await getXConversation(db, { actorId: member.id, conversationId }, sig());
      expect(errorId(one)).toBe("E_X_007");
    });
  });

  it("reply status unanswered then replied with first name", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db, { name: "Dana Scully" });
      const accountId = await seedXAccount(db, { members: [member.id], overdueAfterHours: 6 });
      const conversationId = await seedXConversation(db, accountId);
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T10:00:00Z"),
      });
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T11:00:00Z"),
      });
      const args = { actorId: member.id, accountId, view: "inbox" as const };
      const first = await listXConversations(db, args, sig());
      if (!first.ok) throw first.error;
      const status = first.value.rows[0]?.replyStatus;
      expect(status?.kind).toBe("unanswered");
      if (status?.kind !== "unanswered") return;
      expect(new Date(status.waitingSince).toISOString()).toBe("2026-01-01T10:00:00.000Z");
      expect(status.overdueAfterHours).toBe(6);
      await seedXMessage(db, conversationId, {
        direction: "outbound",
        at: at("2026-01-01T12:00:00Z"),
        sentByUserId: member.id,
      });
      const second = await listXConversations(db, args, sig());
      if (!second.ok) throw second.error;
      expect(second.value.rows[0]?.replyStatus).toEqual({ kind: "replied", byName: "Dana" });
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T13:00:00Z"),
      });
      const third = await listXConversations(db, args, sig());
      if (!third.ok) throw third.error;
      const again = third.value.rows[0]?.replyStatus;
      expect(again?.kind === "unanswered" ? new Date(again.waitingSince).toISOString() : null).toBe(
        "2026-01-01T13:00:00.000Z",
      );
    });
  });

  it("encrypted row has a status from sender and no snippet", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [member.id] });
      const conversationId = await seedXConversation(db, accountId, { encrypted: true });
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T09:00:00Z"),
        text: "stored before the flip",
      });
      await seedXMessage(db, conversationId, {
        direction: "outbound",
        at: at("2026-01-01T10:00:00Z"),
        text: "",
      });
      const list = await listXConversations(
        db,
        { actorId: member.id, accountId, view: "inbox" },
        sig(),
      );
      if (!list.ok) throw list.error;
      const row = list.value.rows[0];
      expect(row?.encrypted).toBe(true);
      expect(row?.snippet).toBeNull();
      expect(row?.replyStatus).toEqual({ kind: "replied", byName: null });
      const one = await getXConversation(db, { actorId: member.id, conversationId }, sig());
      if (!one.ok) throw one.error;
      expect(one.value.messages.map((m) => [m.text, m.unreadable])).toEqual([
        ["stored before the flip", false],
        ["", true],
      ]);
    });
  });
});
