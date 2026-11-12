import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import {
  intercomContacts,
  intercomConversationContacts,
  intercomConversationParts,
  intercomConversations,
  intercomSyncState,
} from "./index";

const at = new Date("2026-10-01T10:00:00Z");

describe("intercom schema", () => {
  test("deleting a conversation removes its parts and contact links", async () => {
    await withTestDb(async (db) => {
      await db.insert(intercomConversations).values({
        id: "c1",
        title: null,
        state: "open",
        snippet: "Hello",
        createdAt: at,
        updatedAt: at,
        lastPartAt: at,
        messageCount: 1,
        lastReplierName: "Pat",
        lastReplierType: "user",
      });
      await db.insert(intercomConversationParts).values({
        id: "p1",
        conversationId: "c1",
        partType: "comment",
        authorType: "user",
        authorName: "Pat",
        bodyHtml: "<p>Hello</p>",
        createdAt: at,
      });
      await db
        .insert(intercomConversationContacts)
        .values({ conversationId: "c1", contactId: "k1" });
      await db.delete(intercomConversations).where(eq(intercomConversations.id, "c1"));
      expect(await db.select().from(intercomConversationParts)).toHaveLength(0);
      expect(await db.select().from(intercomConversationContacts)).toHaveLength(0);
    });
  });

  test("a contact email must already be lowercased", async () => {
    await withTestDb(async (db) => {
      await expect(
        db.insert(intercomContacts).values({ id: "k1", email: "Pat@Example.com", role: "user" }),
      ).rejects.toThrow();
    });
  });

  test("the sync state is a single row", async () => {
    await withTestDb(async (db) => {
      await db.insert(intercomSyncState).values({ cursorUpdatedAt: 100 });
      await expect(
        db.insert(intercomSyncState).values({ id: false, cursorUpdatedAt: 200 }),
      ).rejects.toThrow();
    });
  });
});
