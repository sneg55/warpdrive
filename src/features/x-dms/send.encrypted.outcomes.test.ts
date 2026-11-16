import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import type * as ChatKeys from "./chatKeys";
import type * as ConversationKeys from "./conversationKeys";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_CONVERSATION,
} from "./eventFixtures.test-helpers";
import type * as KeyedParser from "./keyedParser";
import type { ChatKeyring } from "./keyedParser";
import { sendErrorForClient } from "./sendClientError";
import { encryptedSetup } from "./sendEncrypted.test-helpers";
import { CONVERSATION, messageRows } from "./syncSeed.test-helpers";

const opened = vi.hoisted(() => ({
  keyrings: [] as ChatKeyring[],
  conversationKeys: [] as Uint8Array[],
  encryptedFor: [] as string[],
  blobs: [] as Uint8Array[],
}));

vi.mock("./chatKeys", async (importOriginal) => {
  const real = await importOriginal<typeof ChatKeys>();
  return {
    ...real,
    loadChatKeys: async (...a: Parameters<typeof real.loadChatKeys>) => {
      const r = await real.loadChatKeys(...a);
      if (r.ok) opened.blobs.push(...r.value.map((k) => k.blob));
      return r;
    },
  };
});

vi.mock("./keyedParser", async (importOriginal) => {
  const real = await importOriginal<typeof KeyedParser>();
  return {
    ...real,
    createChatKeyring: async (keys: Parameters<typeof real.createChatKeyring>[0]) => {
      const r = await real.createChatKeyring(keys);
      if (!r.ok) return r;
      opened.keyrings.push(r.value);
      for (const chat of r.value.chats) {
        const encrypt = chat.encryptMessage.bind(chat);
        Object.assign(chat, {
          encryptMessage: (p: Parameters<typeof encrypt>[0]) => {
            opened.encryptedFor.push(p.conversationId);
            return encrypt(p);
          },
        });
      }
      return r;
    },
  };
});

vi.mock("./conversationKeys", async (importOriginal) => {
  const real = await importOriginal<typeof ConversationKeys>();
  return {
    ...real,
    ensureConversationKey: async (...a: Parameters<typeof real.ensureConversationKey>) => {
      const r = await real.ensureConversationKey(...a);
      if (r.ok) opened.conversationKeys.push(r.value.conversationKey);
      return r;
    },
  };
});

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

afterEach(() => {
  const keyrings = opened.keyrings.splice(0);
  const conversationKeys = opened.conversationKeys.splice(0);
  const blobs = opened.blobs.splice(0);
  opened.encryptedFor.length = 0;
  expect(keyrings.every((k) => k.disposed)).toBe(true);
  expect(conversationKeys.every((k) => k.every((b) => b === 0))).toBe(true);
  expect(blobs.length > 0 && blobs.every((k) => k.every((b) => b === 0))).toBe(true);
});

const outboundCount = async (db: Db, conversationId: string) =>
  (await messageRows(db, conversationId)).filter((m) => m.direction === "outbound").length;

const httpFailure = (status: number | null, transient: boolean) =>
  new AppError(ERROR_IDS.X_HTTP_FAILED, "x", { status, transient });

describe("sendXReply encrypted outcomes", () => {
  it("encrypts for the SDK colon conversation id and posts to the stored hyphen id", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      expect((await s.send("hi")).ok).toBe(true);
      expect(opened.encryptedFor).toEqual([FIXTURE_CONVERSATION]);
      expect(s.chatSends.map((c) => c.conversationId)).toEqual([CONVERSATION]);
    });
  });

  it("a 403 refusal surfaces E_X_006 with its detail and stores nothing", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      s.fake.failNext.set(
        "sendChatMessage",
        new AppError(ERROR_IDS.X_SEND_REFUSED, "refused", { detail: "closed their DMs" }),
      );
      const r = await s.send("hi");
      expect(r.ok ? null : sendErrorForClient(r.error)).toEqual({
        ok: false,
        error: { id: ERROR_IDS.X_SEND_REFUSED, detail: "closed their DMs" },
      });
      expect(await outboundCount(db, s.conversation.id)).toBe(0);
      expect(opened.conversationKeys).toHaveLength(1);
    });
  });

  it.each([
    ["a timeout", httpFailure(null, true)],
    ["a 5xx", httpFailure(503, true)],
    ["an unparsable 2xx body", new AppError(ERROR_IDS.X_PARSE_FAILED, "x", { path: "/p" })],
  ])("%s on the message post surfaces E_X_012 and stores nothing", async (_label, failure) => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      s.fake.failNext.set("sendChatMessage", failure);
      const r = await s.send("hi");
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_SEND_UNCONFIRMED);
      expect(s.chatSends).toHaveLength(1);
      expect(await outboundCount(db, s.conversation.id)).toBe(0);
    });
  });

  it.each([
    ["listEvents", httpFailure(null, true)],
    ["getPublicKeys", httpFailure(503, true)],
    ["addConversationKeys", httpFailure(null, true)],
  ] as const)("a transient %s failure before the post is returned as itself", async (name, e) => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      if (name === "addConversationKeys") s.fake.keyEvents.clear();
      s.fake.failNext.set(name, e);
      const r = await s.send("hi");
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_HTTP_FAILED);
      expect([s.chatSends, s.fake.sent]).toEqual([[], []]);
      expect(await outboundCount(db, s.conversation.id)).toBe(0);
    });
  });

  it.each([
    "listEvents",
    "getPublicKeys",
    "sendChatMessage",
  ] as const)("an abort during %s disposes the keyring it opened", async (name) => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      const controller = new AbortController();
      const inner = s.fake.client;
      s.fake.client = {
        ...inner,
        [name]: (...a: unknown[]) => {
          controller.abort();
          return (inner[name] as (...x: unknown[]) => unknown)(...a);
        },
      };
      const before = opened.keyrings.length;
      await expect(s.send("hi", controller.signal)).rejects.toThrow();
      expect(opened.keyrings.length).toBe(before + 1);
    });
  });
});
