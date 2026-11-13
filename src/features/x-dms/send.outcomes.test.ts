import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { wsChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { channelVersions } from "@/db/schema/realtime";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { encryptToken } from "@/features/email/crypto";
import { seedXAccount, seedXConversation, sig } from "./reads.test-helpers";
import { breakRealtimePublish } from "./realtimeFailure.test-helpers";
import { sendXReply } from "./send";
import { sendErrorForClient } from "./sendClientError";
import { fakeSendEventId, makeXFake } from "./xFake.test-helpers";

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
  const fake = makeXFake();
  fake.sendAtMs = Date.now();
  const send = (text: string) =>
    sendXReply({ db, client: fake.client }, { actorId: member.id, conversationId, text }, sig());
  return { member, conversationId, fake, send };
}

const stored = async (db: Db, conversationId: string) =>
  (
    await db.execute(sql`SELECT text, has_media, sent_by_user_id FROM x_messages
      WHERE conversation_id = ${conversationId} ORDER BY sent_at`)
  ).rows as Array<{ text: string; has_media: boolean; sent_by_user_id: string | null }>;

async function seedSyncedCopy(
  db: Db,
  conversationId: string,
  eventId: string,
  o: { text: string; hasMedia: boolean },
): Promise<void> {
  await db.execute(sql`INSERT INTO x_messages
    (conversation_id, x_event_id, direction, sender_x_user_id, text, has_media, sent_at)
    VALUES (${conversationId}, ${eventId}, 'outbound', 'me', ${o.text}, ${o.hasMedia}, now())`);
}

async function versionOf(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ version: channelVersions.version })
    .from(channelVersions)
    .where(eq(channelVersions.channel, wsChannel.user(userId)));
  return Number(row?.version ?? 0);
}

describe("sendXReply outcomes", () => {
  it("a placeholder stored by sync before the reply gets the sent text", async () => {
    await withTestDb(async (db) => {
      const { member, conversationId, fake, send } = await setup(db);
      const eventId = fakeSendEventId(fake.sendAtMs ?? 0, 1);
      await seedSyncedCopy(db, conversationId, eventId, { text: "", hasMedia: false });
      expect((await send("typed reply")).ok).toBe(true);
      expect(await stored(db, conversationId)).toEqual([
        { text: "typed reply", has_media: false, sent_by_user_id: member.id },
      ]);
    });
  });

  it("a readable or media copy stored by sync keeps its own content", async () => {
    await withTestDb(async (db) => {
      const { conversationId, fake, send } = await setup(db);
      await seedSyncedCopy(db, conversationId, fakeSendEventId(fake.sendAtMs ?? 0, 1), {
        text: "as X stored it",
        hasMedia: false,
      });
      await seedSyncedCopy(db, conversationId, fakeSendEventId(fake.sendAtMs ?? 0, 2), {
        text: "",
        hasMedia: true,
      });
      await send("first");
      await send("second");
      expect((await stored(db, conversationId)).map((r) => [r.text, r.has_media])).toEqual([
        ["as X stored it", false],
        ["", true],
      ]);
    });
  });

  it("publishes the update with the stored reply", async () => {
    await withTestDb(async (db) => {
      const { member, send } = await setup(db);
      expect((await send("hi")).ok).toBe(true);
      expect(await versionOf(db, member.id)).toBe(1);
    });
  });

  it("a publish failure rolls the stored reply back and returns E_X_011", async () => {
    await withTestDb(async (db) => {
      const { conversationId, fake, send } = await setup(db);
      await breakRealtimePublish(db);
      const r = await send("hi");
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_SENT_NOT_RECORDED);
      expect(fake.sent).toHaveLength(1);
      expect(await stored(db, conversationId)).toEqual([]);
    });
  });

  it.each([
    [
      "a network error",
      new AppError(ERROR_IDS.X_HTTP_FAILED, "x", { status: null, transient: true }),
    ],
    ["a 5xx", new AppError(ERROR_IDS.X_HTTP_FAILED, "x", { status: 503, transient: true })],
    ["an unparsable 2xx body", new AppError(ERROR_IDS.X_PARSE_FAILED, "x", { path: "/p" })],
  ])("%s is reported as unconfirmed and stores nothing", async (_label, failure) => {
    await withTestDb(async (db) => {
      const { conversationId, fake, send } = await setup(db);
      fake.failNext.set("sendDm", failure);
      const r = await send("hi");
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_SEND_UNCONFIRMED);
      if (!r.ok)
        expect(sendErrorForClient(r.error)).toEqual({
          ok: false,
          error: { id: ERROR_IDS.X_SEND_UNCONFIRMED },
        });
      expect(await stored(db, conversationId)).toEqual([]);
    });
  });

  it("a definitive 4xx and a failed token refresh are not reported as unconfirmed", async () => {
    await withTestDb(async (db) => {
      const { fake, send } = await setup(db);
      fake.failNext.set(
        "sendDm",
        new AppError(ERROR_IDS.X_HTTP_FAILED, "x", { status: 400, transient: false }),
      );
      const refused = await send("hi");
      expect(refused.ok ? null : refused.error.id).toBe(ERROR_IDS.X_HTTP_FAILED);
      fake.failNext.set(
        "sendDm",
        new AppError(ERROR_IDS.X_HTTP_FAILED, "x", { status: 401, transient: false }),
      );
      fake.failNext.set(
        "refresh",
        new AppError(ERROR_IDS.X_PARSE_FAILED, "x", { transient: true }),
      );
      const refresh = await send("hi");
      expect(refresh.ok ? null : refresh.error.id).toBe(ERROR_IDS.X_PARSE_FAILED);
      expect(fake.refreshCalls).toHaveLength(1);
    });
  });
});
