import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_TEXT,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { runXSync, runXSyncAll } from "./sync";
import {
  accountRow,
  addEvents,
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
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
const UNKNOWN_TYPE_CONVERSATION = `${FIXTURE_ME}-1000000000000000004`;

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const inbound = (daysAgo: number, senderId: string = FIXTURE_THEM) =>
  eventFrom(f.plaintextMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId });

describe("runXSync edges", () => {
  it("a conversation needing keys is marked encrypted and keeps earlier messages", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(3)] });
      await runXSync(deps(db, fake), accountId, sig());
      const sealed = eventFrom(f.encryptedMessage, {
        at: NOW_MS - DAY_MS,
        senderId: FIXTURE_THEM,
      });
      addEvents(fake, [
        sealed,
        eventFrom(f.keyChange, { at: NOW_MS - 2 * DAY_MS, senderId: FIXTURE_ME }),
      ]);
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      expect(row?.encrypted).toBe(true);
      expect(row?.teamReadAt).toBeNull();
      expect(row?.lastInboundAt).toEqual(sealed.createdAt);
      const messages = await messageRows(db, row?.id ?? "");
      expect(messages.map((m) => [m.xEventId === sealed.id, m.text, m.direction])).toEqual([
        [false, FIXTURE_TEXT, "inbound"],
        [true, "", "inbound"],
      ]);
    });
  });

  it("skips group and unknown-type conversations and keeps a profile the expansion left out", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      fake.users.set(FIXTURE_THEM, THEM_USER);
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(2)] });
      await runXSync(deps(db, fake), accountId, sig());
      fake.users.clear();
      addEvents(fake, [inbound(1)]);
      putConversation(fake, {
        id: OTHER_CONVERSATION,
        participantId: OTHER,
        type: "group",
        events: [inbound(0.5, OTHER)],
      });
      putConversation(fake, {
        id: UNKNOWN_TYPE_CONVERSATION,
        participantId: OTHER,
        type: "broadcast",
        events: [inbound(0.25, OTHER)],
      });
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 1 } });
      expect(await conversationRow(db, accountId, OTHER_CONVERSATION)).toBeUndefined();
      expect(await conversationRow(db, accountId, UNKNOWN_TYPE_CONVERSATION)).toBeUndefined();
      expect((await conversationRow(db, accountId))?.participantUsername).toBe("them");
    });
  });

  it("warns with a count when events fail to parse for other reasons", async () => {
    await withTestDb(async (db) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, {
        events: [inbound(1), eventFrom(f.undecodable, { at: NOW_MS - DAY_MS, senderId: OTHER })],
      });
      await runXSync(deps(db, fake), accountId, sig());
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("1");
      expect(JSON.stringify(warn.mock.calls)).not.toContain(FIXTURE_TEXT);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(FIXTURE_THEM);
      warn.mockRestore();
    });
  });

  it("a rate limit stops the run after applying older conversations", async () => {
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
            error: new AppError(ERROR_IDS.X_RATE_LIMITED, "limited", { resetAtMs: NOW_MS + 9000 }),
          });
        return listEvents(t, a, s);
      };
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_RATE_LIMITED);
      expect(await conversationRow(db, accountId)).toBeDefined();
      expect(await conversationRow(db, accountId, OTHER_CONVERSATION)).toBeUndefined();
      expect((await accountRow(db, accountId))?.conversationsSyncedAt).toBeNull();
    });
  });

  it("an account disconnected mid-run ends with a result, not a throw", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(1)] });
      const listEvents = fake.client.listEvents.bind(fake.client);
      fake.client.listEvents = async (t, a, s) => {
        await db.delete(xAccounts).where(eq(xAccounts.id, accountId));
        return listEvents(t, a, s);
      };
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_ACCOUNT_NOT_FOUND);
      expect(await conversationRow(db, accountId)).toBeUndefined();
    });
  });

  it("one failing account does not stop the next", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      putConversation(fake, { events: [inbound(1)] });
      const a = await seedAccount(db);
      const b = await seedAccount(db, { xUserId: "1000000000000000009" });
      await seedAccount(db, { xUserId: "1000000000000000008", status: "reconnect_required" });
      fake.failNext.set(
        "listConversations",
        new AppError(ERROR_IDS.X_HTTP_FAILED, "down", { status: 500, transient: true }),
      );
      const results = await runXSyncAll(deps(db, fake), sig());
      expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
      const rows = [await accountRow(db, a), await accountRow(db, b)];
      const failed = rows.filter((r) => r?.lastErrorId === ERROR_IDS.X_HTTP_FAILED);
      const synced = rows.filter((r) => r?.lastErrorId === null);
      expect(failed).toHaveLength(1);
      expect(failed[0]?.lastSyncAt).toBeNull();
      expect(synced).toHaveLength(1);
      expect(synced[0]?.lastSyncAt).toEqual(new Date(NOW_MS));
    });
  });
});
