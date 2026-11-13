import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getXConversation, listXConversations } from "./reads";
import { at, seedXAccount, seedXConversation, seedXMessage, sig } from "./reads.test-helpers";

describe("x dm reads content and paging", () => {
  it("snippet skips placeholders, truncates, media-only messages stay listed, and the pane gets placeholders as unreadable", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db, { name: "Fox Mulder" });
      const accountId = await seedXAccount(db, { members: [member.id] });
      const conversationId = await seedXConversation(db, accountId);
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T09:00:00Z"),
        text: "x".repeat(200),
      });
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T09:30:00Z"),
        text: "",
        hasMedia: true,
      });
      await seedXMessage(db, conversationId, {
        direction: "outbound",
        at: at("2026-01-01T10:00:00Z"),
        text: "on it",
        sentByUserId: member.id,
      });
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T11:00:00Z"),
        text: "",
      });
      const list = await listXConversations(
        db,
        { actorId: member.id, accountId, view: "inbox" },
        sig(),
      );
      if (!list.ok) throw list.error;
      expect(list.value.rows[0]?.snippet).toBe("on it");
      expect(list.value.rows[0]?.replyStatus?.kind).toBe("unanswered");
      expect(list.value.rows[0]?.lastMessageAt).toBe("2026-01-01T11:00:00.000Z");
      const one = await getXConversation(db, { actorId: member.id, conversationId }, sig());
      if (!one.ok) throw one.error;
      expect(one.value.conversation.accountId).toBe(accountId);
      expect(one.value.conversation.xUnread).toBe(false);
      expect(
        one.value.messages.map((m) => [
          m.direction,
          m.text.length,
          m.hasMedia,
          m.sentByFirstName,
          m.unreadable,
        ]),
      ).toEqual([
        ["inbound", 200, false, null, false],
        ["inbound", 0, true, null, false],
        ["outbound", 5, false, "Fox", false],
        ["inbound", 0, false, null, true],
      ]);
      expect(one.value.messages[0]?.sentAt).toBe("2026-01-01T09:00:00.000Z");
      const shortened = await seedXConversation(db, accountId);
      await seedXMessage(db, shortened, {
        direction: "inbound",
        at: at("2026-01-02T09:00:00Z"),
        text: "y".repeat(200),
      });
      const again = await listXConversations(
        db,
        { actorId: member.id, accountId, view: "inbox" },
        sig(),
      );
      if (!again.ok) throw again.error;
      expect(again.value.rows[0]?.snippet).toBe("y".repeat(140));
    });
  });

  it("pages newest first through a tie at the page boundary and leaves out conversations with no messages", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [member.id] });
      const ids: string[] = [];
      for (let i = 0; i < 52; i += 1) {
        const id = await seedXConversation(db, accountId);
        await seedXMessage(db, id, {
          direction: "inbound",
          at: new Date(Date.UTC(2026, 0, 1, 0, Math.max(i, 3))),
        });
        ids.push(id);
      }
      const empty = await seedXConversation(db, accountId);
      const args = { actorId: member.id, accountId, view: "inbox" as const };
      const first = await listXConversations(db, args, sig());
      if (!first.ok) throw first.error;
      expect(first.value.rows).toHaveLength(50);
      expect(typeof first.value.nextCursor).toBe("string");
      const cursor = first.value.nextCursor ?? undefined;
      const second = await listXConversations(db, { ...args, cursor }, sig());
      if (!second.ok) throw second.error;
      expect(second.value.nextCursor).toBeNull();
      const all = [...first.value.rows, ...second.value.rows].map((r) => r.id);
      expect(new Set(all).size).toBe(52);
      expect(all.includes(empty)).toBe(false);
      const tied = ids.slice(0, 4).sort().reverse();
      expect(all).toEqual([...ids.slice(4).reverse(), ...tied]);
      const bad = await listXConversations(db, { ...args, cursor: "not-a-cursor" }, sig());
      expect(bad.ok ? null : bad.error.id).toBe("E_X_009");
    });
  });
});
