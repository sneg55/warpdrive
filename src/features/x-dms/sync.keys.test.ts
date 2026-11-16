import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { xConversations, xMessages } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { encryptToken } from "@/features/email/crypto";
import { loadChatKeyState } from "./chatKeyState";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_TEXT,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { runXSync } from "./sync";
import {
  HELD_KEY_VERSION,
  keyedAccount,
  ROTATED_KEY_VERSION,
  seedChatKeys,
  seedRawChatKey,
  servePublicKeys,
  syncedAccount,
} from "./syncKeys.test-helpers";
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
} from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

afterEach(() => {
  vi.restoreAllMocks();
});

type EventKey = "plaintextMessage" | "encryptedMessage" | "readReceipt";

const at = (template: EventKey, daysAgo: number, senderId = FIXTURE_THEM) =>
  eventFrom(f[template], { at: NOW_MS - daysAgo * DAY_MS, senderId });

const texts = async (db: Parameters<typeof messageRows>[0], accountId: string) => {
  const row = await conversationRow(db, accountId);
  return (await messageRows(db, row?.id ?? "")).map((m) => [m.xEventId, m.text]);
};

describe("runXSync with stored chat keys", () => {
  it("stores a new encrypted message in a known conversation with its text", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f);
      const first = at("plaintextMessage", 2);
      putConversation(fake, { events: [first] });
      await runXSync(deps(db, fake), accountId, sig());
      const sealed = at("encryptedMessage", 1);
      addEvents(fake, [sealed]);
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 1 } });
      expect(await texts(db, accountId)).toEqual([
        [first.id, FIXTURE_TEXT],
        [sealed.id, FIXTURE_TEXT],
      ]);
    });
  });

  it("stores a new conversation whose events all decode as encrypted", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f);
      const sealed = [at("encryptedMessage", 2), at("encryptedMessage", 1, FIXTURE_ME)];
      putConversation(fake, { events: sealed });
      await runXSync(deps(db, fake), accountId, sig());
      expect((await conversationRow(db, accountId))?.encrypted).toBe(true);
      expect(await texts(db, accountId)).toEqual(sealed.map((e) => [e.id, FIXTURE_TEXT]));
    });
  });

  it("fills an existing placeholder row and leaves read and archive state alone", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await syncedAccount(db);
      const sealed = at("encryptedMessage", 1);
      putConversation(fake, { events: [sealed] });
      await runXSync(deps(db, fake), accountId, sig());
      expect(await texts(db, accountId)).toEqual([[sealed.id, ""]]);
      const read = { teamReadAt: new Date(NOW_MS), archivedAt: new Date(NOW_MS) };
      await db
        .update(xConversations)
        .set({ ...read, newestEventId: null })
        .where(eq(xConversations.accountId, accountId));
      await seedChatKeys(db, accountId, f.keyed.meKeys());
      servePublicKeys(fake, f);
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 0 } });
      expect(await texts(db, accountId)).toEqual([[sealed.id, FIXTURE_TEXT]]);
      const row = await conversationRow(db, accountId);
      expect([row?.teamReadAt, row?.archivedAt]).toEqual([read.teamReadAt, read.archivedAt]);
    });
  });

  it("deletes a placeholder that decodes to a read receipt and falls back to older rows", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f);
      const first = at("plaintextMessage", 3);
      const reply = at("plaintextMessage", 2, FIXTURE_ME);
      putConversation(fake, { events: [first, reply] });
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      const receipt = at("readReceipt", 1);
      await db.insert(xMessages).values({
        conversationId: row?.id ?? "",
        xEventId: receipt.id,
        direction: "inbound",
        senderXUserId: FIXTURE_THEM,
        text: "",
        sentAt: receipt.createdAt,
      });
      await db
        .update(xConversations)
        .set({ lastInboundAt: receipt.createdAt, lastMessageAt: receipt.createdAt })
        .where(eq(xConversations.id, row?.id ?? ""));
      addEvents(fake, [receipt]);
      await runXSync(deps(db, fake), accountId, sig());
      expect((await texts(db, accountId)).map(([id]) => id)).toEqual([first.id, reply.id]);
      const after = await conversationRow(db, accountId);
      expect([after?.lastInboundAt, after?.lastMessageAt]).toEqual([
        first.createdAt,
        reply.createdAt,
      ]);
    });
  });

  it("turns stale on a newer public key version and keeps decoding with the held key", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      const sealed = at("encryptedMessage", 2);
      putConversation(fake, { events: [sealed] });
      await runXSync(deps(db, fake), accountId, sig());
      expect(await loadChatKeyState(db, accountId, sig())).toBe("unlocked");
      servePublicKeys(fake, f);
      const next = at("encryptedMessage", 1);
      addEvents(fake, [next]);
      await runXSync(deps(db, fake), accountId, sig());
      expect((await accountRow(db, accountId))?.chatLatestKeyVersion).toBe(ROTATED_KEY_VERSION);
      expect(await loadChatKeyState(db, accountId, sig())).toBe("stale");
      expect(await texts(db, accountId)).toEqual([
        [sealed.id, FIXTURE_TEXT],
        [next.id, FIXTURE_TEXT],
      ]);
    });
  });

  it.each([
    ["keys_enc that does not decrypt", () => Buffer.from("garbage")],
    ["a blob that does not import", () => encryptToken(Buffer.from([1, 2, 3]).toString("base64"))],
  ])("marks keys broken for %s and still stores metadata rows", async (_name, keysEnc) => {
    await withTestDb(async (db) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fake = makeXFake();
      const accountId = await syncedAccount(db);
      await seedRawChatKey(db, accountId, keysEnc());
      servePublicKeys(fake, f);
      const sealed = at("encryptedMessage", 1);
      putConversation(fake, { events: [sealed] });
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r.ok).toBe(true);
      expect((await accountRow(db, accountId))?.chatKeysBrokenAt).toEqual(new Date(NOW_MS));
      expect(logged.mock.calls).toEqual([
        ["E_X_014 x sync: chat keys could not be loaded", { accountId }],
      ]);
      expect(await texts(db, accountId)).toEqual([[sealed.id, ""]]);
    });
  });
});
