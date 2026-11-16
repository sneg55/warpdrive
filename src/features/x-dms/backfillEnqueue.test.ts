import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PGBOSS_QUEUE_X_CHAT_BACKFILL } from "@/constants/jobNames";
import { X_BACKFILL_RESUME_DELAY_SECONDS } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { runXChatBackfill } from "./backfill";
import {
  buildLostKeyConversation,
  LOST_CONVERSATION,
  type LostKeyConversation,
  OTHER,
  recordKeyChanges,
  serveLostKeyConversation,
} from "./backfill.test-helpers";
import { buildChatFixtures, type ChatFixtures } from "./eventFixtures.test-helpers";
import { sig } from "./sendEncrypted.test-helpers";
import { runXSync } from "./sync";
import { HELD_KEY_VERSION, keyedAccount, servePublicKeys } from "./syncKeys.test-helpers";
import {
  accountRow,
  DAY_MS,
  deps,
  eventFrom,
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import { makeXFake, type XFake } from "./xFake.test-helpers";

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

const RESUME_MS = X_BACKFILL_RESUME_DELAY_SECONDS * 1000;

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

async function pendingAccount(db: Db): Promise<{ accountId: string; fake: XFake }> {
  const fake = makeXFake();
  recordKeyChanges(fake);
  const accountId = await keyedAccount(db, f);
  servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
  serveLostKeyConversation(fake, lost);
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
  return { accountId, fake };
}

const startedAt = (db: Db, accountId: string, at: Date | null) =>
  db.update(xAccounts).set({ chatBackfillStartedAt: at }).where(eq(xAccounts.id, accountId));

describe("sync's backfill enqueue gate on the last backfill start", () => {
  it("records the start time when a backfill run starts", async () => {
    await withTestDb(async (db) => {
      const { accountId, fake } = await pendingAccount(db);
      expect((await accountRow(db, accountId))?.chatBackfillStartedAt).toBeNull();
      await runXChatBackfill(deps(db, fake), accountId, sig());
      expect((await accountRow(db, accountId))?.chatBackfillStartedAt).toEqual(new Date(NOW_MS));
    });
  });

  it.each([
    ["skips within the resume delay of the last start", NOW_MS - RESUME_MS + 1000, 0],
    ["enqueues once the resume delay has passed", NOW_MS - RESUME_MS - 1000, 1],
    ["enqueues when no backfill has started", null, 1],
  ])("%s", async (_label, lastStartMs, sends) => {
    await withTestDb(async (db) => {
      const { accountId, fake } = await pendingAccount(db);
      await startedAt(db, accountId, lastStartMs === null ? null : new Date(lastStartMs));
      const send = fakeBoss();
      await runXSync(deps(db, fake), accountId, sig());
      expect(send.mock.calls).toEqual(
        Array.from({ length: sends }, () => [
          PGBOSS_QUEUE_X_CHAT_BACKFILL,
          { accountId },
          { singletonKey: accountId },
        ]),
      );
    });
  });
});
