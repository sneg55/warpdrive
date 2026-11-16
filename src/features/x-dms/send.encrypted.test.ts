import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { X_FIRST_PAGE_SIZE } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { xAccountChatKeys, xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { recordKeyChanges } from "./backfill.test-helpers";
import { buildChatFixtures, type ChatFixtures } from "./eventFixtures.test-helpers";
import { seedXConversation } from "./reads.test-helpers";
import { sendXReply } from "./send";
import {
  asKeyEvent,
  encryptedSetup,
  present,
  sentEvent,
  sig,
  verifiedTexts,
} from "./sendEncrypted.test-helpers";
import { runXSync } from "./sync";
import { ROTATED_KEY_VERSION } from "./syncKeys.test-helpers";
import {
  addEvents,
  CONVERSATION,
  deps,
  eventRequests,
  idAt,
  messageRows,
  NOW_MS,
} from "./syncSeed.test-helpers";

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const REPLY = "an encrypted reply to the lead";

const outbound = async (db: Db, conversationId: string) =>
  (await messageRows(db, conversationId))
    .filter((m) => m.direction === "outbound")
    .map((m) => [m.xEventId, m.text, m.sentByUserId]);

const eventIdOf = async (db: Db, messageId: string) =>
  (
    (await db.execute(sql`SELECT x_event_id FROM x_messages WHERE id = ${messageId}::uuid`))
      .rows[0] as { x_event_id: string }
  ).x_event_id;

describe("sendXReply in an encrypted conversation", () => {
  it("replies through sendChatMessage with the conversation's existing key", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      expect(s.conversation.encrypted).toBe(true);
      const keyChanges = recordKeyChanges(s.fake);
      const before = eventRequests(s.fake).length;
      const r = await s.send(`  ${REPLY}  `);
      if (!r.ok) throw r.error;
      expect(s.fake.sent).toEqual([]);
      expect(keyChanges).toEqual([]);
      expect(eventRequests(s.fake).slice(before)).toEqual([X_FIRST_PAGE_SIZE]);
      expect(s.chatSends.map((c) => c.conversationId)).toEqual([CONVERSATION]);
      const call = present(s.chatSends[0]);
      expect(Buffer.from(call.body.encodedMessageCreateEvent, "base64").includes(REPLY)).toBe(
        false,
      );
      const eventId = await eventIdOf(db, r.value.messageId);
      const sealed = sentEvent(call, eventId);
      expect(f.readAsParticipant([f.keyChange, sealed])).toEqual([REPLY]);
      const events = [f.keyChange.encodedEvent, sealed.encodedEvent];
      expect(await verifiedTexts(f, events)).toEqual({ errors: [], texts: [REPLY] });
      expect((await verifiedTexts(f, events, [])).texts).toEqual([]);
      expect(await outbound(db, s.conversation.id)).toEqual([[eventId, REPLY, s.member.id]]);
    });
  });

  it("creates a conversation key first when none is usable", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      s.fake.keyEvents.set(CONVERSATION, []);
      const keyChanges = recordKeyChanges(s.fake);
      const r = await s.send(REPLY);
      if (!r.ok) throw r.error;
      expect(keyChanges.map((c) => c.id)).toEqual([CONVERSATION]);
      const call = present(s.chatSends[0]);
      const keyEvent = present(s.fake.keyEvents.get(CONVERSATION)?.[0]);
      const eventId = await eventIdOf(db, r.value.messageId);
      expect(f.readAsParticipant([asKeyEvent(keyEvent, "1"), sentEvent(call, eventId)])).toEqual([
        REPLY,
      ]);
    });
  });

  it("refuses on a locked account without calling X", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      await db.delete(xAccountChatKeys).where(eq(xAccountChatKeys.accountId, s.accountId));
      const r = await s.send(REPLY);
      expect(r.ok ? null : [r.error.id, r.error.context?.reason]).toEqual([
        ERROR_IDS.X_INPUT_INVALID,
        "encrypted conversation",
      ]);
      expect([s.chatSends, s.fake.sent]).toEqual([[], []]);
    });
  });

  it.each([
    ["a newer published key", { chatLatestKeyVersion: ROTATED_KEY_VERSION }],
    ["keys marked broken", { chatKeysBrokenAt: new Date() }],
  ])("refuses on a stale account (%s) without calling X", async (_label, set) => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      await db.update(xAccounts).set(set).where(eq(xAccounts.id, s.accountId));
      const r = await s.send(REPLY);
      expect(r.ok ? null : [r.error.id, r.error.context?.reason]).toEqual([
        ERROR_IDS.X_INPUT_INVALID,
        "encrypted conversation",
      ]);
      expect([s.chatSends, s.fake.sent]).toEqual([[], []]);
    });
  });

  it("a later synced copy of the reply dedupes with the stored row", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      const r = await s.send(REPLY);
      if (!r.ok) throw r.error;
      const call = present(s.chatSends[0]);
      const eventId = await eventIdOf(db, r.value.messageId);
      const controlId = idAt(NOW_MS);
      addEvents(s.fake, [sentEvent(call, eventId), sentEvent(call, controlId)]);
      const synced = await runXSync(deps(db, s.fake), s.accountId, sig());
      if (!synced.ok) throw synced.error;
      const rows = await outbound(db, s.conversation.id);
      expect(rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual(
        [
          [eventId, REPLY, s.member.id],
          [controlId, REPLY, null],
        ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      );
    });
  });

  it("a plain conversation on an unlocked account still replies through sendDm", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      const plain = await seedXConversation(db, s.accountId);
      const r = await sendXReply(
        { db, client: s.fake.client },
        { actorId: s.member.id, conversationId: plain, text: REPLY },
        sig(),
      );
      expect(r.ok).toBe(true);
      expect(s.fake.sent.map((m) => m.text)).toEqual([REPLY]);
      expect(s.chatSends).toEqual([]);
    });
  });
});
