import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  type XAccount,
  type XConversation,
  xAccountMembers,
  xAccounts,
  xConversations,
  xMessages,
} from "./index";

const at = new Date("2026-11-01T10:00:00Z");

async function seedConversation(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
  const user = await seedUser(db);
  const [created] = await db
    .insert(xAccounts)
    .values({
      xUserId: "1001",
      username: "brand",
      displayName: "Brand",
      connectedByUserId: user.id,
    })
    .returning();
  const acct = created as XAccount;
  await db.insert(xAccountMembers).values({ accountId: acct.id, userId: user.id });
  const [createdConversation] = await db
    .insert(xConversations)
    .values({
      accountId: acct.id,
      xConversationId: "1001-2002",
      participantXUserId: "2002",
    })
    .returning();
  return { account: acct, conversation: createdConversation as XConversation };
}

describe("x dms schema", () => {
  test("rejects a duplicate x_event_id in one conversation", async () => {
    await withTestDb(async (db) => {
      const { conversation } = await seedConversation(db);
      const row = {
        conversationId: conversation.id,
        xEventId: "9001",
        direction: "inbound" as const,
        senderXUserId: "2002",
        text: "hello",
        sentAt: at,
      };
      await db.insert(xMessages).values(row);
      await expect(db.insert(xMessages).values(row)).rejects.toThrow();
    });
  });

  test("deleting an account cascades to members, conversations and messages", async () => {
    await withTestDb(async (db) => {
      const { account, conversation } = await seedConversation(db);
      await db.insert(xMessages).values({
        conversationId: conversation.id,
        xEventId: "9001",
        direction: "outbound",
        senderXUserId: "1001",
        text: "hi",
        sentAt: at,
      });
      await db.delete(xAccounts).where(eq(xAccounts.id, account.id));
      expect(await db.select().from(xAccountMembers)).toHaveLength(0);
      expect(await db.select().from(xConversations)).toHaveLength(0);
      expect(await db.select().from(xMessages)).toHaveLength(0);
    });
  });
});
