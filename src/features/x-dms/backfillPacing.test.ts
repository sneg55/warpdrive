import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { X_BACKFILL_MAX_CONVERSATIONS_PER_RUN } from "@/constants/xDms";
import { xConversations } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { runXChatBackfill } from "./backfill";
import { recordKeyChanges } from "./backfill.test-helpers";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { sig } from "./sendEncrypted.test-helpers";
import { runXSync } from "./sync";
import { HELD_KEY_VERSION, keyedAccount, servePublicKeys } from "./syncKeys.test-helpers";
import { DAY_MS, deps, eventFrom, NOW_MS, putConversation } from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

describe("backfill pacing", () => {
  it("stops a run after the per-run conversation cap and leaves the rest unmarked", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      recordKeyChanges(fake);
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      const total = X_BACKFILL_MAX_CONVERSATIONS_PER_RUN + 1;
      await db.insert(xConversations).values(
        Array.from({ length: total }, (_, i) => ({
          accountId,
          xConversationId: `${FIXTURE_ME}-${String(9000 + i)}`,
          participantXUserId: FIXTURE_THEM,
          encrypted: true,
          lastMessageAt: new Date(NOW_MS - (i + 1) * 60_000),
        })),
      );
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(X_BACKFILL_MAX_CONVERSATIONS_PER_RUN).toBe(15);
      expect(r.ok && r.value.conversations).toBe(X_BACKFILL_MAX_CONVERSATIONS_PER_RUN);
      const rows = await db
        .select({ marker: xConversations.backfilledKeyVersion })
        .from(xConversations)
        .where(eq(xConversations.accountId, accountId));
      expect(rows.filter((row) => row.marker === null)).toHaveLength(1);
    });
  });

  it("a keyed account with no changed conversations makes no public-keys request", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      putConversation(fake, {
        events: [eventFrom(f.encryptedMessage, { at: NOW_MS - DAY_MS, senderId: FIXTURE_THEM })],
      });
      await runXSync(deps(db, fake), accountId, sig());
      fake.publicKeyCalls.length = 0;
      const again = await runXSync(deps(db, fake), accountId, sig());
      expect(again).toEqual({ ok: true, value: { conversations: 0, messages: 0 } });
      expect(fake.publicKeyCalls).toEqual([]);
    });
  });
});
