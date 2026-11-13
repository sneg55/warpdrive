import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { encryptToken } from "@/features/email/crypto";
import { buildChatFixtures, type ChatFixtures, FIXTURE_THEM } from "./eventFixtures.test-helpers";
import { runXSyncAll } from "./sync";
import {
  accountRow,
  DAY_MS,
  deps,
  eventFrom,
  NOW_MS,
  putConversation,
  seedAccount,
} from "./syncSeed.test-helpers";
import type { XClient } from "./types";
import { makeXFake } from "./xFake.test-helpers";

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const hangUntilAborted = (s: AbortSignal): Promise<never> =>
  new Promise((_, reject) => {
    s.addEventListener("abort", () => reject(s.reason as Error), { once: true });
  });

function trackTokens(client: XClient, hang: (call: number) => boolean) {
  const tokens: string[] = [];
  const list = client.listConversations.bind(client);
  client.listConversations = (t, a, s) => {
    tokens.push(t);
    return hang(tokens.length) ? hangUntilAborted(s) : list(t, a, s);
  };
  return tokens;
}

describe("runXSyncAll account timeouts", () => {
  it("a stalled account times out on its own and the next account still syncs", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      putConversation(fake, {
        events: [eventFrom(f.plaintextMessage, { at: NOW_MS - DAY_MS, senderId: FIXTURE_THEM })],
      });
      const a = await seedAccount(db);
      const b = await seedAccount(db, { xUserId: "1000000000000000009" });
      trackTokens(fake.client, (call) => call === 1);
      const results = await runXSyncAll(
        { ...deps(db, fake), accountTimeoutMs: 200 },
        AbortSignal.timeout(5000),
      );
      expect(results.map((r) => r.ok)).toEqual([false, true]);
      expect((await accountRow(db, a))?.lastErrorId).toBe(ERROR_IDS.X_HTTP_FAILED);
      expect((await accountRow(db, a))?.lastSyncAt).toBeNull();
      expect((await accountRow(db, b))?.lastSyncAt).toEqual(new Date(NOW_MS));
    });
  });

  it("an aborted run stops the loop and the account it never reached goes first next run", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const a = await seedAccount(db);
      const b = await seedAccount(db, { xUserId: "1000000000000000009" });
      await db
        .update(xAccounts)
        .set({ accessTokenEnc: encryptToken("b-access") })
        .where(eq(xAccounts.id, b));
      const run = new AbortController();
      const tokens = trackTokens(fake.client, (call) => {
        if (call === 1) setTimeout(() => run.abort(), 20);
        return call === 1;
      });
      await expect(runXSyncAll(deps(db, fake), run.signal)).rejects.toThrow();
      expect(tokens).toEqual(["stored-access"]);
      await runXSyncAll(deps(db, fake), AbortSignal.timeout(5000));
      expect(tokens.slice(1)).toEqual(["b-access", "stored-access"]);
      expect((await accountRow(db, a))?.lastSyncAt).toEqual(new Date(NOW_MS));
    });
  });
});
