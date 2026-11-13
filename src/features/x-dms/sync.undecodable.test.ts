import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { xReplyStatusProjection } from "./replyStatus";
import { runXSync } from "./sync";
import {
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  messageRows,
  NOW_MS,
  putConversation,
  seedAccount,
} from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

async function waitingSince(db: Db, conversationId: string): Promise<number> {
  const rows = await db.execute(sql`SELECT ${xReplyStatusProjection}
    FROM x_conversations c JOIN x_accounts a ON a.id = c.account_id WHERE c.id = ${conversationId}`);
  const status = (rows.rows[0] as { reply_status: { waitingSince: string } }).reply_status;
  return new Date(status.waitingSince).getTime();
}

describe("runXSync undecodable events", () => {
  it("a new conversation whose only event fails to decode stays listed and unread", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db, { syncedAt: new Date(NOW_MS - DAY_MS) });
      const broken = eventFrom(f.undecodable, { at: NOW_MS - DAY_MS / 2, senderId: FIXTURE_THEM });
      putConversation(fake, { events: [broken] });
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      expect(row?.lastMessageAt).toEqual(broken.createdAt);
      expect(row?.lastInboundAt).toEqual(broken.createdAt);
      expect(row?.teamReadAt).toBeNull();
      expect(row?.encrypted).toBe(false);
      const messages = await messageRows(db, row?.id ?? "");
      expect(messages.map((m) => [m.xEventId, m.direction, m.text, m.hasMedia])).toEqual([
        [broken.id, "inbound", "", false],
      ]);
    });
  });

  it("three encrypted inbound events after an outbound wait from the first of the three", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db, { syncedAt: new Date(NOW_MS - 5 * DAY_MS) });
      const sealed = [3, 2, 1].map((d) =>
        eventFrom(f.encryptedMessage, { at: NOW_MS - d * DAY_MS, senderId: FIXTURE_THEM }),
      );
      const reply = eventFrom(f.plaintextMessage, {
        at: NOW_MS - 4 * DAY_MS,
        senderId: FIXTURE_ME,
      });
      putConversation(fake, { events: [reply, ...sealed] });
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      const placeholders = (await messageRows(db, row?.id ?? "")).filter((m) => m.text === "");
      expect(placeholders.map((m) => m.xEventId)).toEqual(sealed.map((e) => e.id));
      expect(await waitingSince(db, row?.id ?? "")).toBe(NOW_MS - 3 * DAY_MS);
    });
  });
});
