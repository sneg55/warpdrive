import { describe, expect, it, vi } from "vitest";
import { xAccountChatKeys } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { encryptToken } from "@/features/email/crypto";
import { ok } from "@/types/result";
import { loadChatKeys, removeChatKeys, unlockChatKeys } from "./chatKeys";
import { fakeUnlocker, PASSCODE, publicKey, seedAccount, sig } from "./chatKeys.test-helpers";
import type { ChatKeyUnlocker } from "./juicebox";
import { makeXFake } from "./xFake.test-helpers";

describe("loadChatKeys and removeChatKeys", () => {
  it("loads blobs newest version first", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      let n = 0;
      const unlocker: ChatKeyUnlocker = {
        unlock: () => {
          n += 1;
          return Promise.resolve(ok(new Uint8Array([n])));
        },
      };
      const deps = { db, client: fake.client, unlocker };
      const args = { actorId: admin.id, accountId, passcode: PASSCODE };
      for (const versions of [["9"], ["9", "10"]]) {
        fake.client.getPublicKeys = () => Promise.resolve(ok(versions.map((v) => publicKey(v))));
        await unlockChatKeys(deps, args, sig());
      }
      const r = await loadChatKeys(db, accountId, sig());
      expect(r.ok && r.value.map((k) => [k.keyVersion, [...k.blob]])).toEqual([
        ["10", [2]],
        ["9", [1]],
      ]);
    });
  });

  it("removeChatKeys deletes every row for admins only", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const member = await seedUser(db);
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("1")]));
      const { unlocker } = fakeUnlocker();
      await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      const denied = await removeChatKeys(db, { actorId: member.id, accountId }, sig());
      expect(denied.ok ? null : denied.error.id).toBe("E_PERM_006");
      expect(await db.select().from(xAccountChatKeys)).toHaveLength(1);
      const done = await removeChatKeys(db, { actorId: admin.id, accountId }, sig());
      expect(done.ok).toBe(true);
      expect(await db.select().from(xAccountChatKeys)).toHaveLength(0);
    });
  });

  it("zeroes blobs already copied when a later row fails to decrypt", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      await db.insert(xAccountChatKeys).values([
        {
          accountId,
          keyVersion: "2",
          keysEnc: encryptToken("AQID"),
          unlockedAt: new Date(),
          unlockedByUserId: admin.id,
        },
        {
          accountId,
          keyVersion: "1",
          keysEnc: Buffer.from("garbage"),
          unlockedAt: new Date(),
          unlockedByUserId: admin.id,
        },
      ]);
      const fill = vi.spyOn(Uint8Array.prototype, "fill");
      const r = await loadChatKeys(db, accountId, sig());
      expect(r.ok).toBe(false);
      const zeroed = fill.mock.contexts.filter(
        (c, i) => fill.mock.calls[i]?.[0] === 0 && (c as Uint8Array).length === 3,
      );
      expect(zeroed.length).toBeGreaterThan(0);
      fill.mockRestore();
    });
  });
});
