import { ServerChat } from "@xdevplatform/chat-xdk-server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import { ok, type Result } from "@/types/result";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { fixtureSigningKeys, openKeyring } from "./keyedFixtures.test-helpers";
import {
  type AccountChatKeys,
  type ChatKeyring,
  createChatKeyring,
  newestUsableConversationKey,
  toSigningKeys,
  type UsableConversationKey,
} from "./keyedParser";
import type { XSigningKey } from "./types";

let f: ChatFixtures;
let signingKeys: XSigningKey[];
const open: ChatKeyring[] = [];

beforeAll(async () => {
  f = await buildChatFixtures();
  signingKeys = fixtureSigningKeys(f.keyed);
});

afterEach(() => {
  for (const k of open.splice(0)) k.dispose();
  vi.restoreAllMocks();
});

const keyring = (keys: AccountChatKeys) => openKeyring(open, keys);

function usable(r: Result<UsableConversationKey | null, AppError>): UsableConversationKey | null {
  if (!r.ok) throw r.error;
  return r.value;
}

describe("createChatKeyring", () => {
  it("frees every instance once on dispose", async () => {
    const free = vi.spyOn(ServerChat.prototype, "free");
    const r = await createChatKeyring(f.keyed.rotatedKeys());
    if (!r.ok) throw r.error;
    r.value.dispose();
    r.value.dispose();
    expect(free).toHaveBeenCalledTimes(2);
  });

  it("returns E_X_014 for a blob that does not import and frees what it built", async () => {
    const free = vi.spyOn(ServerChat.prototype, "free");
    const good = f.keyed.meKeys().keys;
    const r = await createChatKeyring({
      xUserId: FIXTURE_ME,
      keys: [...good, { keyVersion: "1700000000009", blob: new Uint8Array([1, 2, 3]) }],
    });
    expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_CHAT_KEYS_STALE);
    expect(free).toHaveBeenCalledTimes(2);
  });
});

describe("newestUsableConversationKey", () => {
  it("returns the newest verified conversation key", async () => {
    const ring = await keyring(f.keyed.meKeys());
    const k = usable(newestUsableConversationKey(ring, f.keyed.keyEvents, signingKeys));
    expect(k?.conversationKeyVersion).toBe(f.keyed.conversationKeyVersion);
    expect(k?.conversationKey.length).toBe(32);
    const rotated = await keyring(f.keyed.rotatedKeys());
    const newest = usable(
      newestUsableConversationKey(rotated, f.keyed.rotatedKeyEvents, signingKeys),
    );
    expect(newest?.conversationKeyVersion).toBe(f.keyed.rotatedConversationKeyVersion);
  });

  it("returns null when no stored blob opens a key event", async () => {
    const rotatedOnly = f.keyed.rotatedKeys().keys.slice(0, 1);
    const ring = await keyring({ xUserId: FIXTURE_ME, keys: rotatedOnly });
    expect(newestUsableConversationKey(ring, f.keyed.keyEvents, signingKeys)).toEqual(ok(null));
  });

  it("returns null when the key change cannot be verified", async () => {
    const ring = await keyring(f.keyed.meKeys());
    expect(newestUsableConversationKey(ring, f.keyed.keyEvents, [])).toEqual(ok(null));
  });

  it("refuses a disposed keyring", async () => {
    const ring = await keyring(f.keyed.meKeys());
    ring.dispose();
    expect(() => newestUsableConversationKey(ring, f.keyed.keyEvents, signingKeys)).toThrow(
      expect.objectContaining({ id: ERROR_IDS.X_KEYRING_DISPOSED }),
    );
  });
});

describe("toSigningKeys", () => {
  it("builds one entry per public key version", () => {
    const [k] = f.keyed.publicKeys.them;
    expect(toSigningKeys(FIXTURE_THEM, f.keyed.publicKeys.them)).toEqual([
      {
        userId: FIXTURE_THEM,
        publicKeyVersion: k?.version,
        publicKey: k?.signingPublicKey,
        identityPublicKey: k?.identityPublicKey,
        identityPublicKeySignature: k?.identityPublicKeySignature,
      },
    ]);
  });

  it("skips keys without an identity signature", () => {
    const [k] = f.keyed.publicKeys.them;
    if (!k) throw new Error("fixture missing");
    const unsigned = { ...k, version: "9", identityPublicKeySignature: null };
    const out = toSigningKeys(FIXTURE_THEM, [unsigned, k]);
    expect(out.map((s) => s.publicKeyVersion)).toEqual([k.version]);
    expect(toSigningKeys(FIXTURE_THEM, [unsigned])).toEqual([]);
  });

  it("still opens a key event when the other participant has only an unsigned key", async () => {
    const [them] = f.keyed.publicKeys.them;
    if (!them) throw new Error("fixture missing");
    const keys = [
      ...toSigningKeys(FIXTURE_ME, f.keyed.publicKeys.me),
      ...toSigningKeys(FIXTURE_THEM, [{ ...them, identityPublicKeySignature: null }]),
    ];
    const ring = await keyring(f.keyed.meKeys());
    const k = usable(newestUsableConversationKey(ring, f.keyed.keyEvents, keys));
    expect(k?.conversationKeyVersion).toBe(f.keyed.conversationKeyVersion);
  });
});
