import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { xConversations, xMessages } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { runXChatBackfill } from "./backfill";
import {
  buildLostKeyConversation,
  LOST_CONVERSATION,
  type LostKeyConversation,
  OTHER,
  recordKeyChanges,
  serveLostKeyConversation,
  setBackfilled,
} from "./backfill.test-helpers";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_TEXT,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { runXSync } from "./sync";
import {
  HELD_KEY_VERSION,
  seedChatKeys,
  servePublicKeys,
  syncedAccount,
} from "./syncKeys.test-helpers";
import {
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  messageRows,
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;

let f: ChatFixtures;
let lost: LostKeyConversation;
beforeAll(async () => {
  f = await buildChatFixtures();
  lost = await buildLostKeyConversation();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const at = (template: "encryptedMessage" | "readReceipt", daysAgo: number) =>
  eventFrom(f[template], { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });

const lostAt = (daysAgo: number) =>
  eventFrom(lost.message, {
    at: NOW_MS - daysAgo * DAY_MS,
    senderId: OTHER,
    conversationId: LOST_CONVERSATION,
  });

const eventFetches = (fake: ReturnType<typeof makeXFake>, id: string) =>
  fake.requests.filter((r) => r.path === `/2/chat/conversations/${id}/events`).length;

async function unlock(db: Parameters<typeof seedChatKeys>[0], accountId: string) {
  await seedChatKeys(db, accountId, f.keyed.meKeys());
}

describe("runXChatBackfill", () => {
  it("fills and deletes placeholders without touching read, archive or unread state", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      const older = at("encryptedMessage", 3);
      const sealed = at("encryptedMessage", 2);
      const receipt = at("readReceipt", 1);
      putConversation(fake, { events: [older, sealed, receipt] });
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      const id = row?.id ?? "";
      await db.delete(xMessages).where(eq(xMessages.xEventId, older.id));
      await db.insert(xMessages).values({
        conversationId: id,
        xEventId: receipt.id,
        direction: "inbound",
        senderXUserId: FIXTURE_THEM,
        text: "",
        sentAt: receipt.createdAt,
      });
      const kept = { teamReadAt: new Date(NOW_MS), archivedAt: new Date(NOW_MS), xUnread: false };
      await db
        .update(xConversations)
        .set({ ...kept, lastInboundAt: receipt.createdAt, lastMessageAt: receipt.createdAt })
        .where(eq(xConversations.id, id));
      await unlock(db, accountId);
      fake.requests.length = 0;
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      const texts = (await messageRows(db, id)).map((m) => [m.xEventId, m.text]);
      expect(texts).toEqual([
        [older.id, FIXTURE_TEXT],
        [sealed.id, FIXTURE_TEXT],
      ]);
      const after = await conversationRow(db, accountId);
      expect({
        teamReadAt: after?.teamReadAt,
        archivedAt: after?.archivedAt,
        xUnread: after?.xUnread,
      }).toEqual(kept);
      expect(after?.newestEventId).toBe(row?.newestEventId);
      expect([after?.lastInboundAt, after?.lastMessageAt]).toEqual([
        sealed.createdAt,
        sealed.createdAt,
      ]);
      expect(after?.backfilledKeyVersion).toBe(HELD_KEY_VERSION);
      expect(calls).toEqual([]);
      expect(eventFetches(fake, row?.xConversationId ?? "")).toBeGreaterThan(0);
    });
  });

  it("creates a key including the participant's unsigned key", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      serveLostKeyConversation(fake, lost);
      fake.publicKeys.set(
        OTHER,
        lost.otherKeys.map((k) => ({ ...k, identityPublicKeySignature: null })),
      );
      putConversation(fake, {
        id: LOST_CONVERSATION,
        participantId: OTHER,
        events: [lostAt(1)],
      });
      await runXSync(deps(db, fake), accountId, sig());
      await unlock(db, accountId);
      const first = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(first).toEqual({ ok: true, value: { conversations: 1, keysCreated: 1 } });
      expect(calls.map((c) => c.participantKeys.map((k) => k.userId))).toEqual([
        [FIXTURE_ME, OTHER],
      ]);
    });
  });

  it("creates one key where none decrypts, keeps lost-key rows and creates none again", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      serveLostKeyConversation(fake, lost);
      const message = lostAt(1);
      putConversation(fake, { id: LOST_CONVERSATION, participantId: OTHER, events: [message] });
      await runXSync(deps(db, fake), accountId, sig());
      await unlock(db, accountId);
      const first = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(first).toEqual({ ok: true, value: { conversations: 1, keysCreated: 1 } });
      expect(calls).toEqual([
        {
          id: LOST_CONVERSATION,
          participantKeys: [
            { userId: FIXTURE_ME, publicKeyVersion: HELD_KEY_VERSION },
            { userId: OTHER, publicKeyVersion: lost.otherKeys[0]?.version },
          ],
        },
      ]);
      const row = await conversationRow(db, accountId, LOST_CONVERSATION);
      expect(row?.backfilledKeyVersion).toBe(HELD_KEY_VERSION);
      expect((await messageRows(db, row?.id ?? "")).map((m) => m.text)).toEqual([""]);
      fake.requests.length = 0;
      const again = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(again).toEqual({ ok: true, value: { conversations: 0, keysCreated: 0 } });
      expect(eventFetches(fake, LOST_CONVERSATION)).toBe(0);
      await setBackfilled(db, accountId, null, LOST_CONVERSATION);
      const revisit = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(revisit).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      expect(calls).toHaveLength(1);
    });
  });

  it("does not fetch an encrypted conversation outside the window", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      const old = at("encryptedMessage", 40);
      putConversation(fake, { events: [old] });
      await db.insert(xConversations).values({
        accountId,
        xConversationId: `${FIXTURE_ME}-${FIXTURE_THEM}`,
        participantXUserId: FIXTURE_THEM,
        encrypted: true,
        newestEventId: old.id,
        lastMessageAt: old.createdAt,
      });
      await unlock(db, accountId);
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 0, keysCreated: 0 } });
      expect(fake.requests).toEqual([]);
      expect(calls).toEqual([]);
    });
  });
});
