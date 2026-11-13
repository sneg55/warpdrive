import { beforeAll, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { runXSync } from "./sync";
import {
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
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const OTHER = "1000000000000000003";
const OTHER_CONVERSATION = `${FIXTURE_ME}-${OTHER}`;

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const inbound = (daysAgo: number, senderId: string = FIXTURE_THEM) =>
  eventFrom(f.plaintextMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId });

describe("runXSync window", () => {
  it("a later run does not reach a conversation outside the window", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(40)] });
      await runXSync(deps(db, fake), accountId, sig());
      fake.requests.length = 0;
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 0, messages: 0 } });
      expect(fake.requests).toEqual([{ path: "/2/chat/conversations", maxResults: 5 }]);
      expect(await conversationRow(db, accountId)).toBeUndefined();
    });
  });

  it("a later run stops at an unstored conversation older than the window", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(3)] });
      await runXSync(deps(db, fake), accountId, sig());
      putConversation(fake, {
        id: OTHER_CONVERSATION,
        participantId: OTHER,
        events: [inbound(40, OTHER)],
      });
      addEvents(fake, [inbound(1)]);
      fake.requests.length = 0;
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 1 } });
      expect(eventRequests(fake)).toEqual([5]);
      expect(await conversationRow(db, accountId, OTHER_CONVERSATION)).toBeUndefined();
    });
  });

  it("a retried first run makes a new inbound unread on a row stored earlier", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(2)] });
      putConversation(fake, {
        id: OTHER_CONVERSATION,
        participantId: OTHER,
        events: [inbound(1, OTHER)],
      });
      const listEvents = fake.client.listEvents.bind(fake.client);
      let calls = 0;
      fake.client.listEvents = (t, a, s) => {
        calls += 1;
        if (calls === 2)
          return Promise.resolve({
            ok: false,
            error: new AppError(ERROR_IDS.X_HTTP_FAILED, "down", { status: 500, transient: true }),
          });
        return listEvents(t, a, s);
      };
      const first = await runXSync(deps(db, fake), accountId, sig());
      expect(first.ok).toBe(false);
      expect((await conversationRow(db, accountId))?.teamReadAt).toEqual(new Date(NOW_MS));
      fake.client.listEvents = listEvents;
      addEvents(fake, [inbound(0.5)]);
      await runXSync(deps(db, fake), accountId, sig());
      expect((await conversationRow(db, accountId))?.teamReadAt).toBeNull();
      expect((await conversationRow(db, accountId, OTHER_CONVERSATION))?.teamReadAt).toEqual(
        new Date(NOW_MS),
      );
    });
  });
});
