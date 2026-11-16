import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { xAccountChatKeys, xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { decryptToken } from "@/features/email/crypto";
import { err, ok } from "@/types/result";
import { unlockChatKeys } from "./chatKeys";
import { fakeUnlocker, PASSCODE, publicKey, seedAccount, sig } from "./chatKeys.test-helpers";
import type { ChatKeyUnlocker } from "./juicebox";
import { makeXFake } from "./xFake.test-helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("unlockChatKeys", () => {
  it("rejects a member with E_PERM_006 and never calls the unlocker", async () => {
    await withTestDb(async (db) => {
      const member = await seedUser(db);
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      const { unlocker, calls } = fakeUnlocker();
      const r = await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: member.id, accountId, passcode: PASSCODE },
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe("E_PERM_006");
      expect(calls).toHaveLength(0);
    });
  });

  it("stores the encrypted blob and sets the latest key version", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      await db
        .update(xAccounts)
        .set({ chatKeysBrokenAt: new Date() })
        .where(eq(xAccounts.id, accountId));
      const fake = makeXFake();
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("9"), publicKey("10")]));
      const blob = new Uint8Array([9, 8, 7, 6]);
      const expectedBase64 = Buffer.from(blob).toString("base64");
      const { unlocker, calls } = fakeUnlocker(blob);
      const r = await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      expect(r.ok && r.value).toEqual({ keyVersion: "10" });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.juiceboxConfig).toEqual({ token_map: [] });
      const rows = await db
        .select()
        .from(xAccountChatKeys)
        .where(eq(xAccountChatKeys.accountId, accountId));
      expect(rows).toHaveLength(1);
      const dec = decryptToken(rows[0]?.keysEnc ?? Buffer.alloc(0));
      expect(dec.ok && dec.value).toBe(expectedBase64);
      expect(rows[0]?.unlockedByUserId).toBe(admin.id);
      const [account] = await db.select().from(xAccounts).where(eq(xAccounts.id, accountId));
      expect(account?.chatLatestKeyVersion).toBe("10");
      expect(account?.chatKeysBrokenAt).toBeNull();
    });
  });

  it("zeroes the blob after storing it", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("1")]));
      const blob = new Uint8Array([5, 5, 5]);
      const { unlocker } = fakeUnlocker(blob);
      await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      expect([...blob]).toEqual([0, 0, 0]);
    });
  });

  it("adds a row for a new version and keeps the old one", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      const { unlocker } = fakeUnlocker();
      const deps = { db, client: fake.client, unlocker };
      const args = { actorId: admin.id, accountId, passcode: PASSCODE };
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("1")]));
      await unlockChatKeys(deps, args, sig());
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("1"), publicKey("2")]));
      await unlockChatKeys(deps, args, sig());
      const rows = await db
        .select()
        .from(xAccountChatKeys)
        .where(eq(xAccountChatKeys.accountId, accountId));
      expect(rows.map((x) => x.keyVersion).sort()).toEqual(["1", "2"]);
      const [account] = await db.select().from(xAccounts).where(eq(xAccounts.id, accountId));
      expect(account?.chatLatestKeyVersion).toBe("2");
    });
  });

  it("returns E_X_013 with guessesRemaining and calls the unlocker once on a wrong passcode", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("1")]));
      let calls = 0;
      const unlocker: ChatKeyUnlocker = {
        unlock: (a) => {
          calls += 1;
          return Promise.resolve(
            err(
              new AppError(ERROR_IDS.X_PASSCODE_WRONG, "wrong", {
                accountId: a.accountId,
                guessesRemaining: 3,
              }),
            ),
          );
        },
      };
      const r = await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe("E_X_013");
      expect(r.ok ? null : r.error.context).toMatchObject({ guessesRemaining: 3 });
      expect(calls).toBe(1);
      const rows = await db.select().from(xAccountChatKeys);
      expect(rows).toHaveLength(0);
    });
  });

  it("returns E_X_015 when the public key has no juicebox config", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("1", null)]));
      const { unlocker, calls } = fakeUnlocker();
      const r = await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe("E_X_015");
      expect(calls).toHaveLength(0);
    });
  });

  it("returns E_X_015 when the account has no public keys", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      const { unlocker } = fakeUnlocker();
      const r = await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe("E_X_015");
    });
  });

  it("never lets the passcode reach a stored column, an error context or the console", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
        vi.spyOn(console, m).mockImplementation(() => undefined),
      );
      const fake = makeXFake();
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("1")]));
      const { unlocker } = fakeUnlocker();
      const good = await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("2", null)]));
      const bad = await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      const keyRows = await db.select().from(xAccountChatKeys);
      const accountRows = await db.select().from(xAccounts);
      const dump = JSON.stringify([keyRows, accountRows, good, bad.ok ? null : bad.error.context]);
      expect(dump).not.toContain(PASSCODE);
      expect(JSON.stringify(bad.ok ? null : bad.error.message)).not.toContain(PASSCODE);
      for (const s of spies) expect(s).not.toHaveBeenCalled();
    });
  });

  it("returns E_X_015 for a non-numeric key version and stores nothing", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("1"), publicKey("v2")]));
      const { unlocker, calls } = fakeUnlocker();
      const r = await unlockChatKeys(
        { db, client: fake.client, unlocker },
        { actorId: admin.id, accountId, passcode: PASSCODE },
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe("E_X_015");
      expect(calls).toHaveLength(0);
      expect(await db.select().from(xAccountChatKeys)).toHaveLength(0);
    });
  });
});
