import type { PgBoss } from "pg-boss";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import { err, ok } from "@/types/result";
import { runXChatBackfill } from "./backfill";
import {
  buildLostKeyConversation,
  LOST_CONVERSATION,
  type LostKeyConversation,
  OTHER,
  recordKeyChanges,
  serveLostKeyConversation,
} from "./backfill.test-helpers";
import { buildChatFixtures, type ChatFixtures, FIXTURE_THEM } from "./eventFixtures.test-helpers";
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
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import { makeXFake, type XFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const BOSS_KEY = Symbol.for("warpdrive.jobs.boss");
const setBoss = (boss: PgBoss | null) => {
  (globalThis as { [BOSS_KEY]?: PgBoss | null })[BOSS_KEY] = boss;
};

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

const httpFailed = (status: number | null, transient: boolean) =>
  new AppError(ERROR_IDS.X_HTTP_FAILED, "fake failure", { status, transient });

async function seeded(db: Db) {
  const fake = makeXFake();
  const calls = recordKeyChanges(fake);
  const accountId = await syncedAccount(db);
  servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
  serveLostKeyConversation(fake, lost);
  putConversation(fake, {
    events: [eventFrom(f.encryptedMessage, { at: NOW_MS - 2 * DAY_MS, senderId: FIXTURE_THEM })],
  });
  putConversation(fake, {
    id: LOST_CONVERSATION,
    participantId: OTHER,
    events: [
      eventFrom(lost.message, {
        at: NOW_MS - DAY_MS,
        senderId: OTHER,
        conversationId: LOST_CONVERSATION,
      }),
    ],
  });
  await runXSync(deps(db, fake), accountId, sig());
  await seedChatKeys(db, accountId, f.keyed.meKeys());
  return { fake, calls, accountId };
}

function failLostEvents(fake: XFake, error: AppError) {
  const listEvents = fake.client.listEvents.bind(fake.client);
  fake.client.listEvents = (t, a, s) =>
    a.conversationId === LOST_CONVERSATION ? Promise.resolve(err(error)) : listEvents(t, a, s);
}

const versions = async (db: Db, accountId: string) => [
  (await conversationRow(db, accountId, LOST_CONVERSATION))?.backfilledKeyVersion ?? null,
  (await conversationRow(db, accountId))?.backfilledKeyVersion ?? null,
];

describe("runXChatBackfill per-conversation failures", () => {
  it.each([
    ["a transient X failure", httpFailed(503, true)],
    ["a request that did not complete", httpFailed(null, false)],
    ["a refresh that needs a reconnect", new AppError(ERROR_IDS.X_RECONNECT_REQUIRED, "fake")],
  ])("stops on %s and leaves the conversation for the next run", async (_name, error) => {
    await withTestDb(async (db) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { fake, accountId } = await seeded(db);
      failLostEvents(fake, error);
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r.ok ? null : r.error.id).toBe(error.id);
      expect(await versions(db, accountId)).toEqual([null, null]);
    });
  });

  it.each([
    ["a non-transient X refusal", httpFailed(403, false)],
    ["a response that does not parse", new AppError(ERROR_IDS.X_PARSE_FAILED, "fake")],
  ])("marks the conversation after %s and goes on", async (_name, error) => {
    await withTestDb(async (db) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { fake, accountId } = await seeded(db);
      failLostEvents(fake, error);
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      expect(await versions(db, accountId)).toEqual([HELD_KEY_VERSION, HELD_KEY_VERSION]);
      expect(logged.mock.calls).toEqual([
        [
          `${error.id} x backfill: conversation skipped`,
          { accountId, conversations: 0, keysCreated: 0 },
        ],
      ]);
    });
  });

  it("marks a conversation whose participant has no public keys and stops re-enqueueing", async () => {
    await withTestDb(async (db) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { fake, calls, accountId } = await seeded(db);
      fake.publicKeys.set(OTHER, []);
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      expect(await versions(db, accountId)).toEqual([HELD_KEY_VERSION, HELD_KEY_VERSION]);
      expect(calls).toEqual([]);
      const send = vi.fn(() => Promise.resolve("job-1"));
      setBoss({ send } as unknown as PgBoss);
      await runXSync(deps(db, fake), accountId, sig());
      expect(send).not.toHaveBeenCalled();
    });
  });

  it("stops when the participant's public keys hit a rate limit", async () => {
    await withTestDb(async (db) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { fake, accountId } = await seeded(db);
      fake.client.getPublicKeys = (_t, userId) =>
        Promise.resolve(
          userId === OTHER
            ? err(new AppError(ERROR_IDS.X_RATE_LIMITED, "fake rate limit"))
            : ok(fake.publicKeys.get(userId) ?? []),
        );
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_RATE_LIMITED);
      expect(await versions(db, accountId)).toEqual([null, null]);
    });
  });

  it("marks the conversation when X refuses the new key and goes on", async () => {
    await withTestDb(async (db) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { fake, accountId } = await seeded(db);
      fake.client.addConversationKeys = () => Promise.resolve(err(httpFailed(400, false)));
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      expect(await versions(db, accountId)).toEqual([HELD_KEY_VERSION, HELD_KEY_VERSION]);
    });
  });
});
