import type { PgBoss } from "pg-boss";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PGBOSS_QUEUE_X_CHAT_BACKFILL } from "@/constants/jobNames";
import { X_BACKFILL_RESUME_DELAY_SECONDS } from "@/constants/xDms";
import { withTestDb } from "@/db/testing";
import { err } from "@/types/result";
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
import { enqueueXChatBackfill } from "./enqueue";
import { buildChatFixtures, type ChatFixtures, FIXTURE_THEM } from "./eventFixtures.test-helpers";
import { runXSync } from "./sync";
import {
  HELD_KEY_VERSION,
  keyedAccount,
  seedChatKeys,
  servePublicKeys,
  syncedAccount,
} from "./syncKeys.test-helpers";
import {
  addEvents,
  CONVERSATION,
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import { makeXFake, type XFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const RESUME_MS = X_BACKFILL_RESUME_DELAY_SECONDS * 1000;
const BOSS_KEY = Symbol.for("warpdrive.jobs.boss");
const setBoss = (boss: PgBoss | null) => {
  (globalThis as { [BOSS_KEY]?: PgBoss | null })[BOSS_KEY] = boss;
};

type Send = (name: string, data: unknown, options: unknown) => Promise<string | null>;
function fakeBoss() {
  const send = vi.fn<Send>(() => Promise.resolve("job-1"));
  setBoss({ send } as unknown as PgBoss);
  return send;
}

let f: ChatFixtures;
let lost: LostKeyConversation;
beforeAll(async () => {
  f = await buildChatFixtures();
  lost = await buildLostKeyConversation();
});

afterEach(() => {
  setBoss(null);
  vi.restoreAllMocks();
});

const sealedAt = (daysAgo: number) =>
  eventFrom(f.encryptedMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });

const lostAt = (daysAgo: number) =>
  eventFrom(lost.message, {
    at: NOW_MS - daysAgo * DAY_MS,
    senderId: OTHER,
    conversationId: LOST_CONVERSATION,
  });

const eventFetches = (fake: XFake) =>
  fake.requests.filter((r) => r.path.endsWith("/events")).map((r) => r.path);

function rateLimitOnce(fake: XFake, conversationId: string) {
  const listEvents = fake.client.listEvents.bind(fake.client);
  let failed = false;
  fake.client.listEvents = (t, a, s) => {
    if (failed || a.conversationId !== conversationId) return listEvents(t, a, s);
    failed = true;
    return Promise.resolve(err(new AppError(ERROR_IDS.X_RATE_LIMITED, "fake rate limit")));
  };
}

describe("backfill resume across runs", () => {
  it("returns a rate limit, is enqueued by the next sync and resumes where it stopped", async () => {
    await withTestDb(async (db) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fake = makeXFake();
      recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      serveLostKeyConversation(fake, lost);
      putConversation(fake, { events: [sealedAt(2)] });
      putConversation(fake, {
        id: LOST_CONVERSATION,
        participantId: OTHER,
        events: [lostAt(1)],
      });
      await runXSync(deps(db, fake), accountId, sig());
      await seedChatKeys(db, accountId, f.keyed.meKeys());
      rateLimitOnce(fake, CONVERSATION);
      const cut = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(cut.ok ? null : cut.error.id).toBe(ERROR_IDS.X_RATE_LIMITED);
      const send = fakeBoss();
      const later = { ...deps(db, fake), nowMs: () => NOW_MS + RESUME_MS + 1000 };
      await runXSync(later, accountId, sig());
      expect(send.mock.calls).toEqual([
        [PGBOSS_QUEUE_X_CHAT_BACKFILL, { accountId }, { singletonKey: accountId }],
      ]);
      fake.requests.length = 0;
      const resumed = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(resumed).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      expect(eventFetches(fake)).toEqual([`/2/chat/conversations/${CONVERSATION}/events`]);
      send.mockClear();
      await runXSync(later, accountId, sig());
      expect(send).not.toHaveBeenCalled();
    });
  });

  it("enqueues nothing for an account without key rows", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await syncedAccount(db);
      putConversation(fake, { events: [sealedAt(1)] });
      const send = fakeBoss();
      await runXSync(deps(db, fake), accountId, sig());
      expect((await conversationRow(db, accountId))?.encrypted).toBe(true);
      expect(send).not.toHaveBeenCalled();
    });
  });

  it("clears the backfilled version where sync stores placeholders for a keyed account", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      serveLostKeyConversation(fake, lost);
      putConversation(fake, { events: [sealedAt(3)] });
      putConversation(fake, { id: LOST_CONVERSATION, participantId: OTHER, events: [lostAt(3)] });
      await runXSync(deps(db, fake), accountId, sig());
      await setBackfilled(db, accountId, HELD_KEY_VERSION);
      await setBackfilled(db, accountId, HELD_KEY_VERSION, LOST_CONVERSATION);
      addEvents(fake, [sealedAt(2)]);
      addEvents(fake, [lostAt(2)], LOST_CONVERSATION);
      await runXSync(deps(db, fake), accountId, sig());
      expect((await conversationRow(db, accountId))?.backfilledKeyVersion).toBe(HELD_KEY_VERSION);
      const lostRow = await conversationRow(db, accountId, LOST_CONVERSATION);
      expect(lostRow?.backfilledKeyVersion).toBeNull();
    });
  });
});

describe("enqueueXChatBackfill", () => {
  it("sends one job per account keyed by the account id", async () => {
    const send = fakeBoss();
    await enqueueXChatBackfill("account-1", sig());
    expect(send.mock.calls).toEqual([
      [PGBOSS_QUEUE_X_CHAT_BACKFILL, { accountId: "account-1" }, { singletonKey: "account-1" }],
    ]);
  });

  it("does nothing without a queue", async () => {
    await expect(enqueueXChatBackfill("account-1", sig())).resolves.toBeUndefined();
  });
});
