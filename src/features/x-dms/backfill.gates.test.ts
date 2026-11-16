import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { xConversations } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { encryptToken } from "@/features/email/crypto";
import { runXChatBackfill } from "./backfill";
import { recordKeyChanges } from "./backfill.test-helpers";
import { buildChatFixtures, type ChatFixtures, FIXTURE_THEM } from "./eventFixtures.test-helpers";
import { runXSync } from "./sync";
import {
  HELD_KEY_VERSION,
  keyedAccount,
  seedChatKeys,
  seedRawChatKey,
  servePublicKeys,
  syncedAccount,
} from "./syncKeys.test-helpers";
import {
  addEvents,
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
const BOSS_KEY = Symbol.for("warpdrive.jobs.boss");
const setBoss = (boss: PgBoss | null) => {
  (globalThis as { [BOSS_KEY]?: PgBoss | null })[BOSS_KEY] = boss;
};

function fakeBoss() {
  const send = vi.fn(() => Promise.resolve("job-1"));
  setBoss({ send } as unknown as PgBoss);
  return send;
}

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

afterEach(() => {
  setBoss(null);
  vi.restoreAllMocks();
});

const sealedAt = (daysAgo: number) =>
  eventFrom(f.encryptedMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });

describe("sync enqueue gates", () => {
  it.each([
    ["once when the newest published key is held", [HELD_KEY_VERSION], 1],
    ["nothing when the newest published key is not held", undefined, 0],
  ])("enqueues %s", async (_name, meVersions, sends) => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f, { meVersions });
      putConversation(fake, { events: [sealedAt(1)] });
      const send = fakeBoss();
      await runXSync(deps(db, fake), accountId, sig());
      expect(send).toHaveBeenCalledTimes(sends);
    });
  });

  it("enqueues nothing while the stored keys are broken", async () => {
    await withTestDb(async (db) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fake = makeXFake();
      const accountId = await syncedAccount(db);
      await seedRawChatKey(db, accountId, encryptToken(Buffer.from([1, 2]).toString("base64")));
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      putConversation(fake, { events: [sealedAt(1)] });
      const send = fakeBoss();
      await runXSync(deps(db, fake), accountId, sig());
      expect((await conversationRow(db, accountId))?.encrypted).toBe(true);
      expect(send).not.toHaveBeenCalled();
    });
  });

  it("keeps a committed sync when the backfill enqueue fails", async () => {
    await withTestDb(async (db) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      putConversation(fake, { events: [sealedAt(1)] });
      const send = vi.fn(() => Promise.reject(new AppError(ERROR_IDS.DB_INSERT_FAILED, "fake")));
      setBoss({ send } as unknown as PgBoss);
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 1 } });
      expect(logged.mock.calls).toEqual([["x sync: backfill enqueue failed", { accountId }]]);
    });
  });

  it("rethrows an abort raised while enqueueing the backfill", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      putConversation(fake, { events: [sealedAt(1)] });
      const controller = new AbortController();
      const send = vi.fn(() => {
        controller.abort();
        return Promise.reject(controller.signal.reason as Error);
      });
      setBoss({ send } as unknown as PgBoss);
      await expect(runXSync(deps(db, fake), accountId, controller.signal)).rejects.toThrow();
    });
  });
});

describe("runXChatBackfill and the sync cursor", () => {
  it("leaves events newer than the stored cursor to sync", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      putConversation(fake, { events: [sealedAt(3)] });
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      const archivedAt = new Date(NOW_MS);
      await db
        .update(xConversations)
        .set({ archivedAt })
        .where(eq(xConversations.id, row?.id ?? ""));
      const newer = sealedAt(1);
      addEvents(fake, [newer]);
      await seedChatKeys(db, accountId, f.keyed.meKeys());
      await runXChatBackfill(deps(db, fake), accountId, sig());
      const ids = async () => (await messageRows(db, row?.id ?? "")).map((m) => m.xEventId);
      expect(await ids()).not.toContain(newer.id);
      expect((await conversationRow(db, accountId))?.archivedAt).toEqual(archivedAt);
      await runXSync(deps(db, fake), accountId, sig());
      expect(await ids()).toContain(newer.id);
      expect((await conversationRow(db, accountId))?.archivedAt).toBeNull();
    });
  });

  it("does not mark a conversation whose cursor moved during the run", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      putConversation(fake, { events: [sealedAt(3)] });
      await runXSync(deps(db, fake), accountId, sig());
      await seedChatKeys(db, accountId, f.keyed.meKeys());
      const listEvents = fake.client.listEvents.bind(fake.client);
      fake.client.listEvents = async (t, a, s) => {
        await db
          .update(xConversations)
          .set({ newestEventId: sealedAt(1).id })
          .where(eq(xConversations.accountId, accountId));
        return listEvents(t, a, s);
      };
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 0, keysCreated: 0 } });
      expect((await conversationRow(db, accountId))?.backfilledKeyVersion).toBeNull();
    });
  });
});
