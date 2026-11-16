import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { recordKeyChanges } from "./backfill.test-helpers";
import { ensureConversationKey } from "./conversationKeys";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { type ChatKeyring, createChatKeyring } from "./keyedParser";
import { HELD_KEY_VERSION, servePublicKeys, syncedAccount } from "./syncKeys.test-helpers";
import { CONVERSATION } from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;

let f: ChatFixtures;
const open: ChatKeyring[] = [];
beforeAll(async () => {
  f = await buildChatFixtures();
});

afterEach(() => {
  for (const k of open.splice(0)) k.dispose();
});

async function keyring(): Promise<ChatKeyring> {
  const r = await createChatKeyring(f.keyed.meKeys());
  if (!r.ok) throw r.error;
  open.push(r.value);
  return r.value;
}

const request = async (accountId: string, keyEvents: string[]) => ({
  accountId,
  accountXUserId: FIXTURE_ME,
  xConversationId: CONVERSATION,
  participantXUserId: FIXTURE_THEM,
  keyring: await keyring(),
  keyEvents,
  pageEvents: [],
});

describe("ensureConversationKey", () => {
  it("returns the newest usable key without posting a key change", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      const r = await ensureConversationKey(
        { db, client: fake.client },
        await request(accountId, f.keyed.keyEvents),
        sig(),
      );
      expect(r.ok ? [r.value.created, r.value.conversationKeyVersion] : r.error.id).toEqual([
        false,
        f.keyed.conversationKeyVersion,
      ]);
      expect(calls).toEqual([]);
    });
  });

  it("creates a key for the held version when none decrypts", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      const r = await ensureConversationKey(
        { db, client: fake.client },
        await request(accountId, []),
        sig(),
      );
      expect(r.ok ? r.value.created : r.error.id).toBe(true);
      expect(calls.map((c) => c.participantKeys.map((k) => k.publicKeyVersion))).toEqual([
        [HELD_KEY_VERSION, f.keyed.publicKeys.them[0]?.version],
      ]);
    });
  });

  it("decodes an existing key when the participant's only key is unsigned", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      fake.publicKeys.set(
        FIXTURE_THEM,
        f.keyed.publicKeys.them.map((k) => ({ ...k, identityPublicKeySignature: null })),
      );
      const r = await ensureConversationKey(
        { db, client: fake.client },
        await request(accountId, f.keyed.keyEvents),
        sig(),
      );
      expect(r.ok ? [r.value.created, r.value.conversationKeyVersion] : r.error.id).toEqual([
        false,
        f.keyed.conversationKeyVersion,
      ]);
      expect(calls).toEqual([]);
    });
  });

  it("includes the participant's unsigned key when creating a key", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      fake.publicKeys.set(
        FIXTURE_THEM,
        f.keyed.publicKeys.them.map((k) => ({ ...k, identityPublicKeySignature: null })),
      );
      const r = await ensureConversationKey(
        { db, client: fake.client },
        await request(accountId, []),
        sig(),
      );
      expect(r.ok ? r.value.created : r.error.id).toBe(true);
      expect(
        calls.map((c) => c.participantKeys.map((k) => [k.userId, k.publicKeyVersion])),
      ).toEqual([
        [
          [FIXTURE_ME, HELD_KEY_VERSION],
          [FIXTURE_THEM, f.keyed.publicKeys.them[0]?.version],
        ],
      ]);
    });
  });

  it("refuses when the newest published key is not held", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f);
      const r = await ensureConversationKey(
        { db, client: fake.client },
        await request(accountId, []),
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_CHAT_KEYS_STALE);
      expect(calls).toEqual([]);
    });
  });

  it("refuses without the participant's public keys", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      fake.publicKeys.delete(FIXTURE_THEM);
      const r = await ensureConversationKey(
        { db, client: fake.client },
        await request(accountId, f.keyed.keyEvents),
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_PUBLIC_KEYS_MISSING);
      expect(calls).toEqual([]);
    });
  });
});
