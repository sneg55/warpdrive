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

const listRequests = (fake: XFake) =>
  fake.requests.filter((r) => r.path === "/2/chat/conversations").map((r) => r.maxResults);

describe("runXSync list paging", () => {
  it("pages into a second page of 100 and stops at the first unchanged conversation", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      for (let i = 1; i <= 8; i++) put(fake, i, i + 1);
      await runXSync(deps(db, fake), accountId, sig());
      fake.requests.length = 0;
      for (let i = 1; i <= 6; i++) addEvents(fake, [eventIn(i, i / 10)], conversationOf(i));
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 6, messages: 6 } });
      expect(listRequests(fake)).toEqual([5, 100]);
      expect(eventRequests(fake)).toHaveLength(6);
    });
  });

  it("a first page of old group conversations stops without a second request", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      for (let i = 1; i <= 6; i++) put(fake, i, 40 + i, "group");
      await runXSync(deps(db, fake), accountId, sig());
      expect(listRequests(fake)).toEqual([5]);
    });
  });

  it("groups older than the newest synced activity count as unchanged for paging", async () => {
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
      expect(listRequests(fake)).toEqual([5]);
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
