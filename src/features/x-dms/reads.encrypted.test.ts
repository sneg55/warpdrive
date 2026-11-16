import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { xAccountChatKeys, xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getXConversation, listXConversations } from "./reads";
import { at, seedXAccount, seedXConversation, seedXMessage, sig } from "./reads.test-helpers";

type KeyState = "unlocked" | "locked" | "stale";

async function setKeyState(db: Db, accountId: string, state: KeyState): Promise<void> {
  if (state === "locked") return;
  await db.insert(xAccountChatKeys).values({
    accountId,
    keyVersion: "v1",
    keysEnc: Buffer.from([1]),
    unlockedAt: new Date(),
  });
  await db
    .update(xAccounts)
    .set({ chatLatestKeyVersion: state === "stale" ? "v2" : "v1" })
    .where(eq(xAccounts.id, accountId));
}

async function seedEncrypted(db: Db, state: KeyState) {
  const member = await seedUser(db);
  const accountId = await seedXAccount(db, { members: [member.id] });
  const conversationId = await seedXConversation(db, accountId, { encrypted: true });
  await seedXMessage(db, conversationId, {
    direction: "inbound",
    at: at("2026-01-01T09:00:00Z"),
    text: "decrypted hello",
  });
  await setKeyState(db, accountId, state);
  return { member, accountId, conversationId };
}

async function read(db: Db, s: Awaited<ReturnType<typeof seedEncrypted>>, actorId = s.member.id) {
  const list = await listXConversations(
    db,
    { actorId, accountId: s.accountId, view: "inbox" },
    sig(),
  );
  const one = await getXConversation(db, { actorId, conversationId: s.conversationId }, sig());
  return { list, one };
}

describe("encrypted conversation reads by key state", () => {
  it("unlocked account: snippet, lock flag and canReply", async () => {
    await withTestDb(async (db) => {
      const s = await seedEncrypted(db, "unlocked");
      const { list, one } = await read(db, s);
      if (!list.ok || !one.ok) throw new Error("read failed");
      expect(list.value.rows[0]?.encrypted).toBe(true);
      expect(list.value.rows[0]?.snippet).toBe("decrypted hello");
      expect(one.value.conversation.canReply).toBe(true);
    });
  });

  it.each(["locked", "stale"] as const)("%s account: no snippet and no canReply", async (state) => {
    await withTestDb(async (db) => {
      const s = await seedEncrypted(db, state);
      const { list, one } = await read(db, s);
      if (!list.ok || !one.ok) throw new Error("read failed");
      expect(list.value.rows[0]?.snippet).toBeNull();
      expect(one.value.conversation.canReply).toBe(false);
    });
  });

  it("broken keys count as stale", async () => {
    await withTestDb(async (db) => {
      const s = await seedEncrypted(db, "unlocked");
      await db
        .update(xAccounts)
        .set({ chatKeysBrokenAt: new Date() })
        .where(eq(xAccounts.id, s.accountId));
      const { list, one } = await read(db, s);
      if (!list.ok || !one.ok) throw new Error("read failed");
      expect(list.value.rows[0]?.snippet).toBeNull();
      expect(one.value.conversation.canReply).toBe(false);
    });
  });

  it("plain conversations can always be answered", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const accountId = await seedXAccount(db, { members: [member.id] });
      const conversationId = await seedXConversation(db, accountId);
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: at("2026-01-01T09:00:00Z"),
      });
      const one = await getXConversation(db, { actorId: member.id, conversationId }, sig());
      if (!one.ok) throw one.error;
      expect(one.value.conversation.canReply).toBe(true);
    });
  });

  it("a user who is not on the account sees nothing even when unlocked", async () => {
    await withTestDb(async (db) => {
      const s = await seedEncrypted(db, "unlocked");
      const outsider = await seedUser(db);
      const { list, one } = await read(db, s, outsider.id);
      expect(list.ok).toBe(false);
      expect(one.ok).toBe(false);
    });
  });
});
