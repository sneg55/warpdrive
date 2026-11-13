import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { encryptToken } from "@/features/email/crypto";
import {
  removeMember,
  seedXAccount,
  seedXConversation,
  seedXMessage,
  sig,
} from "./reads.test-helpers";
import { sendXReply } from "./send";
import { fakeSendEventId, makeXFake } from "./xFake.test-helpers";

const HOUR_MS = 3_600_000;

async function withTokens(db: Db, accountId: string): Promise<void> {
  await db.execute(sql`UPDATE x_accounts SET
    access_token_enc = ${encryptToken("stored-access")},
    refresh_token_enc = ${encryptToken("stored-refresh")},
    access_token_expires_at = ${new Date(Date.now() + HOUR_MS).toISOString()}::timestamptz
    WHERE id = ${accountId}`);
}

async function setup(db: Db, o: { encrypted?: boolean } = {}) {
  const member = await seedUser(db);
  const accountId = await seedXAccount(db, { members: [member.id] });
  await withTokens(db, accountId);
  const conversationId = await seedXConversation(db, accountId, { encrypted: o.encrypted });
  return { member, accountId, conversationId, fake: makeXFake() };
}

const messages = async (db: Db, conversationId: string) =>
  (
    await db.execute(sql`SELECT x_event_id, direction, sender_x_user_id, text, has_media,
      sent_by_user_id FROM x_messages WHERE conversation_id = ${conversationId} ORDER BY sent_at`)
  ).rows as Array<{
    x_event_id: string;
    direction: string;
    sender_x_user_id: string;
    text: string;
    has_media: boolean;
    sent_by_user_id: string | null;
  }>;

describe("sendXReply", () => {
  it("member reply is stored with sent_by_user_id", async () => {
    await withTestDb(async (db) => {
      const { member, accountId, conversationId, fake } = await setup(db);
      fake.sendAtMs = Date.now();
      const r = await sendXReply(
        { db, client: fake.client },
        { actorId: member.id, conversationId, text: "  hi there  " },
        sig(),
      );
      expect(r.ok).toBe(true);
      expect(fake.sent.map((s) => s.text)).toEqual(["hi there"]);
      const rows = await messages(db, conversationId);
      const account = (
        await db.execute(sql`SELECT x_user_id FROM x_accounts WHERE id=${accountId}`)
      ).rows[0] as { x_user_id: string };
      expect(rows).toEqual([
        {
          x_event_id: fakeSendEventId(fake.sendAtMs, 1),
          direction: "outbound",
          sender_x_user_id: account.x_user_id,
          text: "hi there",
          has_media: false,
          sent_by_user_id: member.id,
        },
      ]);
      if (r.ok) {
        const id = (
          await db.execute(sql`SELECT id FROM x_messages WHERE conversation_id=${conversationId}`)
        ).rows[0] as { id: string };
        expect(r.value.messageId).toBe(id.id);
      }
      const conv = (
        await db.execute(sql`SELECT last_message_at, newest_event_id, last_inbound_at
          FROM x_conversations WHERE id=${conversationId}`)
      ).rows[0] as {
        last_message_at: Date | null;
        newest_event_id: string | null;
        last_inbound_at: Date | null;
      };
      expect(conv.last_message_at).not.toBeNull();
      expect(conv.newest_event_id).toBeNull();
      expect(conv.last_inbound_at).toBeNull();
    });
  });

  it("does not move last_message_at backwards", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake } = await setup(db);
      const future = new Date(Date.now() + HOUR_MS);
      await seedXMessage(db, conversationId, { direction: "inbound", at: future });
      await sendXReply(
        { db, client: fake.client },
        { actorId: member.id, conversationId, text: "x" },
        sig(),
      );
      const conv = (
        await db.execute(
          sql`SELECT last_message_at FROM x_conversations WHERE id=${conversationId}`,
        )
      ).rows[0] as { last_message_at: Date };
      expect(new Date(conv.last_message_at).getTime()).toBe(future.getTime());
    });
  });

  it("non-member and removed member rejected", async () => {
    await withTestDb(async (db) => {
      const { member, accountId, conversationId, fake } = await setup(db);
      const stranger = await seedUser(db);
      const deps = { db, client: fake.client };
      const denied = await sendXReply(
        deps,
        { actorId: stranger.id, conversationId, text: "x" },
        sig(),
      );
      expect(!denied.ok && denied.error.id).toBe(ERROR_IDS.X_ACCOUNT_NOT_FOUND);
      await removeMember(db, accountId, member.id);
      const removed = await sendXReply(
        deps,
        { actorId: member.id, conversationId, text: "x" },
        sig(),
      );
      expect(!removed.ok && removed.error.id).toBe(ERROR_IDS.X_ACCOUNT_NOT_FOUND);
      expect(fake.sent).toEqual([]);
      expect(await messages(db, conversationId)).toEqual([]);
    });
  });

  it("member removed during the X call is not recorded as the sender", async () => {
    await withTestDb(async (db) => {
      const { member, accountId, conversationId, fake } = await setup(db);
      const inner = fake.client;
      fake.client = {
        ...inner,
        sendDm: async (t, a, s) => {
          await removeMember(db, accountId, member.id);
          return inner.sendDm(t, a, s);
        },
      };
      const r = await sendXReply(
        { db, client: fake.client },
        { actorId: member.id, conversationId, text: "x" },
        sig(),
      );
      expect(r.ok).toBe(true);
      const rows = await messages(db, conversationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.sent_by_user_id).toBeNull();
    });
  });

  it("encrypted conversation rejects a send", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake } = await setup(db, { encrypted: true });
      const r = await sendXReply(
        { db, client: fake.client },
        { actorId: member.id, conversationId, text: "x" },
        sig(),
      );
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_INPUT_INVALID);
      expect(fake.sent).toEqual([]);
    });
  });

  it("empty or over-long text is rejected without calling X", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake } = await setup(db);
      const deps = { db, client: fake.client };
      for (const text of ["   ", "a".repeat(10001)]) {
        const r = await sendXReply(deps, { actorId: member.id, conversationId, text }, sig());
        expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_INPUT_INVALID);
      }
      const max = await sendXReply(
        deps,
        { actorId: member.id, conversationId, text: "a".repeat(10000) },
        sig(),
      );
      expect(max.ok).toBe(true);
      expect(fake.sent).toHaveLength(1);
    });
  });

  it("refusal stores nothing and returns X_SEND_REFUSED with detail", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake } = await setup(db);
      fake.failNext.set(
        "sendDm",
        new AppError(ERROR_IDS.X_SEND_REFUSED, "refused", { detail: "closed their DMs" }),
      );
      const r = await sendXReply(
        { db, client: fake.client },
        { actorId: member.id, conversationId, text: "x" },
        sig(),
      );
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_SEND_REFUSED);
      expect(!r.ok && r.error.context?.detail).toBe("closed their DMs");
      expect(await messages(db, conversationId)).toEqual([]);
    });
  });

  it("a 429 stores nothing and returns X_RATE_LIMITED with resetAtMs", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake } = await setup(db);
      fake.failNext.set(
        "sendDm",
        new AppError(ERROR_IDS.X_RATE_LIMITED, "limit", { resetAtMs: 1_900_000_000_000 }),
      );
      const r = await sendXReply(
        { db, client: fake.client },
        { actorId: member.id, conversationId, text: "x" },
        sig(),
      );
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_RATE_LIMITED);
      expect(!r.ok && r.error.context?.resetAtMs).toBe(1_900_000_000_000);
      expect(await messages(db, conversationId)).toEqual([]);
    });
  });

  it("sync seeing the reply first still ends with sent_by_user_id set", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake } = await setup(db);
      fake.sendAtMs = Date.now();
      await db.execute(sql`INSERT INTO x_messages
        (conversation_id, x_event_id, direction, sender_x_user_id, text, has_media, sent_at)
        VALUES (${conversationId}, ${fakeSendEventId(fake.sendAtMs, 1)}, 'outbound', 'me', 'hi',
          false, now())`);
      const r = await sendXReply(
        { db, client: fake.client },
        { actorId: member.id, conversationId, text: "hi" },
        sig(),
      );
      expect(r.ok).toBe(true);
      const rows = await messages(db, conversationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.sent_by_user_id).toBe(member.id);
      if (r.ok) {
        const id = (
          await db.execute(sql`SELECT id FROM x_messages WHERE conversation_id=${conversationId}`)
        ).rows[0] as { id: string };
        expect(r.value.messageId).toBe(id.id);
      }
    });
  });
});
