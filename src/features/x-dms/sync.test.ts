import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { xConversations, xMessages } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_TEXT,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { runXSync } from "./sync";
import {
  accountRow,
  addEvents,
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  eventRequests,
  messageRows,
  NOW_MS,
  putConversation,
  seedAccount,
  THEM_USER,
} from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const OTHER = "1000000000000000003";
const OTHER_CONVERSATION = `${FIXTURE_ME}-${OTHER}`;

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const inbound = (daysAgo: number) =>
  eventFrom(f.plaintextMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });
const outbound = (daysAgo: number) =>
  eventFrom(f.plaintextMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_ME });

describe("runXSync", () => {
  it("first run imports the 30-day window as read", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      fake.users.set(FIXTURE_THEM, THEM_USER);
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(2), inbound(1), inbound(35)] });
      putConversation(fake, {
        id: OTHER_CONVERSATION,
        participantId: OTHER,
        events: [eventFrom(f.plaintextMessage, { at: NOW_MS - 40 * DAY_MS, senderId: OTHER })],
      });
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 2 } });
      const row = await conversationRow(db, accountId);
      expect(row?.teamReadAt).toEqual(new Date(NOW_MS));
      expect(row?.lastInboundAt).toEqual(new Date(NOW_MS - DAY_MS));
      expect(row?.lastMessageAt).toEqual(new Date(NOW_MS - DAY_MS));
      expect(row?.participantUsername).toBe("them");
      expect(row?.participantName).toBe("Them Person");
      expect(row?.participantXUserId).toBe(FIXTURE_THEM);
      expect(row?.xUnread).toBe(true);
      expect(row?.newestEventId).toBe(fake.conversations[0]?.newestEventId);
      expect(await conversationRow(db, accountId, OTHER_CONVERSATION)).toBeUndefined();
      const messages = await messageRows(db, row?.id ?? "");
      expect(messages.map((m) => [m.text, m.direction, m.sentAt])).toEqual([
        [FIXTURE_TEXT, "inbound", new Date(NOW_MS - 2 * DAY_MS)],
        [FIXTURE_TEXT, "inbound", new Date(NOW_MS - DAY_MS)],
      ]);
      expect((await accountRow(db, accountId))?.conversationsSyncedAt).toEqual(new Date(NOW_MS));
    });
  });

  it("idle run makes one list request of 5 and no event requests", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(1)] });
      await runXSync(deps(db, fake), accountId, sig());
      fake.requests.length = 0;
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 0, messages: 0 } });
      expect(fake.requests).toEqual([{ path: "/2/chat/conversations", maxResults: 5 }]);
    });
  });

  it("changed conversation fetches events until a stored one", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [6, 5, 4, 3, 2, 1].map((d) => inbound(d + 1)) });
      await runXSync(deps(db, fake), accountId, sig());
      fake.requests.length = 0;
      addEvents(fake, [inbound(0.5), inbound(0.25)]);
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 2 } });
      expect(eventRequests(fake)).toEqual([5]);
      const row = await conversationRow(db, accountId);
      expect(await messageRows(db, row?.id ?? "")).toHaveLength(8);
    });
  });

  it("seven new events fetch a second page of 100", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(3)] });
      await runXSync(deps(db, fake), accountId, sig());
      fake.requests.length = 0;
      addEvents(
        fake,
        [7, 6, 5, 4, 3, 2, 1].map((h) => inbound(h / 24)),
      );
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 7 } });
      expect(eventRequests(fake)).toEqual([5, 100]);
    });
  });

  it("classifies outbound by sender", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(2), outbound(1)] });
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      const messages = await messageRows(db, row?.id ?? "");
      expect(messages.map((m) => [m.direction, m.senderXUserId, m.sentByUserId])).toEqual([
        ["inbound", FIXTURE_THEM, null],
        ["outbound", FIXTURE_ME, null],
      ]);
      expect(row?.lastInboundAt).toEqual(new Date(NOW_MS - 2 * DAY_MS));
      expect(row?.lastMessageAt).toEqual(new Date(NOW_MS - DAY_MS));
    });
  });

  it("new inbound unarchives and makes it unread", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(2)] });
      await runXSync(deps(db, fake), accountId, sig());
      await db
        .update(xConversations)
        .set({ archivedAt: new Date(NOW_MS - DAY_MS) })
        .where(eq(xConversations.accountId, accountId));
      addEvents(fake, [outbound(1)]);
      await runXSync(deps(db, fake), accountId, sig());
      const afterOutbound = await conversationRow(db, accountId);
      expect(afterOutbound?.archivedAt).not.toBeNull();
      expect(afterOutbound?.teamReadAt).not.toBeNull();
      addEvents(fake, [inbound(0.5)]);
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      expect(row?.archivedAt).toBeNull();
      expect(row?.teamReadAt).toBeNull();
      expect(row?.lastInboundAt).toEqual(new Date(NOW_MS - DAY_MS / 2));
    });
  });

  it("a reply stored at send time is not duplicated and keeps sent_by_user_id", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const member = await seedUser(db);
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(2)] });
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      const reply = outbound(1);
      await db.insert(xMessages).values({
        conversationId: row?.id ?? "",
        xEventId: reply.id,
        direction: "outbound",
        senderXUserId: FIXTURE_ME,
        text: FIXTURE_TEXT,
        sentAt: reply.createdAt,
        sentByUserId: member.id,
      });
      addEvents(fake, [inbound(0.5), reply]);
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 1 } });
      const messages = await messageRows(db, row?.id ?? "");
      expect(messages.map((m) => [m.xEventId, m.direction, m.sentByUserId])).toEqual([
        [expect.any(String), "inbound", null],
        [reply.id, "outbound", member.id],
        [expect.any(String), "inbound", null],
      ]);
    });
  });
});
