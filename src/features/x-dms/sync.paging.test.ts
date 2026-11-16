import { beforeAll, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { buildChatFixtures, type ChatFixtures, FIXTURE_ME } from "./eventFixtures.test-helpers";
import { runXSync, runXSyncAll } from "./sync";
import {
  accountRow,
  addEvents,
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  eventRequests,
  NOW_MS,
  putConversation,
  seedAccount,
} from "./syncSeed.test-helpers";
import { makeXFake, type XFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const participant = (i: number) => String(1000000000000000100n + BigInt(i));
const conversationOf = (i: number) => `${FIXTURE_ME}-${participant(i)}`;

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const eventIn = (i: number, daysAgo: number) =>
  eventFrom(f.plaintextMessage, {
    at: NOW_MS - daysAgo * DAY_MS,
    senderId: participant(i),
    conversationId: conversationOf(i),
  });

function put(fake: XFake, i: number, daysAgo: number, type: "direct" | "group" = "direct") {
  putConversation(fake, {
    id: conversationOf(i),
    participantId: participant(i),
    type,
    events: [eventIn(i, daysAgo)],
  });
}

function listInOrder(fake: XFake, order: number[]) {
  const all = fake.conversations;
  fake.conversations = order.flatMap((i) => all.filter((x) => x.id === conversationOf(i)));
}

const listRequests = (fake: XFake) =>
  fake.requests.filter((r) => r.path === "/2/chat/conversations").map((r) => r.maxResults);

describe("runXSync list paging", () => {
  it("a later run fetches events only for the changed conversations", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      for (let i = 1; i <= 8; i++) put(fake, i, i + 1);
      await runXSync(deps(db, fake), accountId, sig());
      fake.requests.length = 0;
      for (let i = 1; i <= 6; i++) addEvents(fake, [eventIn(i, i / 10)], conversationOf(i));
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 6, messages: 6 } });
      expect(listRequests(fake)).toEqual([100]);
      expect(eventRequests(fake)).toHaveLength(6);
    });
  });

  it("old group conversations are skipped without event requests", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      for (let i = 1; i <= 6; i++) put(fake, i, 40 + i, "group");
      await runXSync(deps(db, fake), accountId, sig());
      expect(listRequests(fake)).toEqual([100]);
      expect(eventRequests(fake)).toHaveLength(0);
    });
  });

  it("a run imports the changed direct conversation and skips the groups", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      put(fake, 0, 1);
      for (let i = 1; i <= 4; i++) put(fake, i, 1 + i / 2, "group");
      put(fake, 5, 5);
      await runXSync(deps(db, fake), accountId, sig());
      fake.requests.length = 0;
      addEvents(fake, [eventIn(0, 0.1)], conversationOf(0));
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 1 } });
      expect(listRequests(fake)).toEqual([100]);
      expect(eventRequests(fake)).toHaveLength(1);
    });
  });
});

describe("runXSync with a conversation list not sorted by activity", () => {
  it("a first run imports recent conversations listed after ones older than the window", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      put(fake, 1, 3);
      put(fake, 2, 40);
      put(fake, 3, 2);
      listInOrder(fake, [2, 1, 3]);
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 2, messages: 2 } });
      expect(await conversationRow(db, accountId, conversationOf(1))).toBeDefined();
      expect(await conversationRow(db, accountId, conversationOf(3))).toBeDefined();
      expect(await conversationRow(db, accountId, conversationOf(2))).toBeUndefined();
    });
  });

  it("a later run picks up a new message listed after unchanged and old conversations", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      put(fake, 1, 3);
      put(fake, 2, 40);
      put(fake, 3, 2);
      await runXSync(deps(db, fake), accountId, sig());
      addEvents(fake, [eventIn(3, 0.1)], conversationOf(3));
      put(fake, 4, 1);
      listInOrder(fake, [1, 2, 3, 4]);
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 2, messages: 2 } });
      expect(await conversationRow(db, accountId, conversationOf(4))).toBeDefined();
    });
  });

  it("reads every page of the list in pages of 100", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      for (let i = 1; i <= 150; i++) put(fake, i, i <= 149 ? 40 : 1);
      listInOrder(
        fake,
        Array.from({ length: 150 }, (_, k) => k + 1),
      );
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 1 } });
      expect(listRequests(fake)).toEqual([100, 100]);
    });
  });
});

describe("runXSyncAll rate limits", () => {
  it("a rate-limited account is recorded and the next account still syncs", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      put(fake, 1, 1);
      const a = await seedAccount(db);
      const b = await seedAccount(db, { xUserId: "1000000000000000009" });
      fake.failNext.set(
        "listConversations",
        new AppError(ERROR_IDS.X_RATE_LIMITED, "limited", { resetAtMs: NOW_MS + 600_000 }),
      );
      const results = await runXSyncAll(deps(db, fake), AbortSignal.timeout(2000));
      expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
      const rows = [await accountRow(db, a), await accountRow(db, b)];
      const limited = rows.find((r) => r?.lastErrorId === ERROR_IDS.X_RATE_LIMITED);
      const synced = rows.find((r) => r?.lastErrorId === null);
      expect(limited?.lastSyncAt).toBeNull();
      expect(synced?.lastSyncAt).toEqual(new Date(NOW_MS));
      expect(await conversationRow(db, synced?.id ?? "", conversationOf(1))).toBeDefined();
    });
  });
});
