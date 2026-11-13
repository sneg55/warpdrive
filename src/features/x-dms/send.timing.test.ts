import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { encryptToken } from "@/features/email/crypto";
import { seedXAccount, seedXConversation, seedXMessage, sig } from "./reads.test-helpers";
import { xReplyStatusProjection } from "./replyStatus";
import { sendXReply } from "./send";
import { sendErrorForClient } from "./sendClientError";
import { makeXFake } from "./xFake.test-helpers";

const HOUR_MS = 3_600_000;

async function setup(db: Db) {
  const member = await seedUser(db);
  const accountId = await seedXAccount(db, { members: [member.id] });
  await db.execute(sql`UPDATE x_accounts SET
    access_token_enc = ${encryptToken("stored-access")},
    refresh_token_enc = ${encryptToken("stored-refresh")},
    access_token_expires_at = ${new Date(Date.now() + HOUR_MS).toISOString()}::timestamptz
    WHERE id = ${accountId}`);
  const conversationId = await seedXConversation(db, accountId);
  return { member, conversationId, fake: makeXFake() };
}

async function replyKind(db: Db, conversationId: string): Promise<string> {
  const rows = await db.execute(sql`SELECT ${xReplyStatusProjection}
    FROM x_conversations c JOIN x_accounts a ON a.id = c.account_id WHERE c.id = ${conversationId}`);
  return (rows.rows[0] as { reply_status: { kind: string } }).reply_status.kind;
}

function failingTransactions(db: Db): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "transaction")
        return () => Promise.reject(new AppError(ERROR_IDS.DB_INVARIANT, "storage down"));
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("sendXReply timing and storage", () => {
  it("times a reply by X's event id, so an inbound X recorded later keeps it unanswered", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake } = await setup(db);
      fake.sendAtMs = Date.now() - 2 * HOUR_MS;
      const r = await sendXReply(
        { db, client: fake.client },
        { actorId: member.id, conversationId, text: "hi" },
        sig(),
      );
      expect(r.ok).toBe(true);
      await seedXMessage(db, conversationId, {
        direction: "inbound",
        at: new Date(Date.now() - HOUR_MS),
      });
      expect(await replyKind(db, conversationId)).toBe("unanswered");
      const stored = await db.execute(sql`SELECT sent_at FROM x_messages
        WHERE conversation_id = ${conversationId} AND direction = 'outbound'`);
      const sentAt = (stored.rows[0] as { sent_at: string }).sent_at;
      expect(new Date(sentAt)).toEqual(new Date(fake.sendAtMs));
    });
  });

  it("a failed store after X accepted the reply returns its error ID and sends once", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake } = await setup(db);
      const r = await sendXReply(
        { db: failingTransactions(db), client: fake.client },
        { actorId: member.id, conversationId, text: "hi" },
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_SENT_NOT_RECORDED);
      expect(fake.sent).toHaveLength(1);
      if (!r.ok)
        expect(sendErrorForClient(r.error)).toEqual({
          ok: false,
          error: { id: ERROR_IDS.X_SENT_NOT_RECORDED },
        });
    });
  });
});
