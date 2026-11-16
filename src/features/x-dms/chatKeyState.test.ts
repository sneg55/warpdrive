import { describe, expect, it } from "vitest";
import { xAccountChatKeys, xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { chatKeyState, loadChatKeyState } from "./chatKeyState";

const sig = () => new AbortController().signal;

describe("chatKeyState", () => {
  it("is locked with no key versions", () => {
    expect(chatKeyState({ keyVersions: [], latestKeyVersion: "v1", brokenAt: null })).toBe(
      "locked",
    );
  });

  it("is unlocked when the latest version is stored", () => {
    expect(
      chatKeyState({ keyVersions: ["v1", "v2"], latestKeyVersion: "v2", brokenAt: null }),
    ).toBe("unlocked");
  });

  it("is stale when the latest version is missing", () => {
    expect(chatKeyState({ keyVersions: ["v1"], latestKeyVersion: "v2", brokenAt: null })).toBe(
      "stale",
    );
  });

  it("is stale when keys are marked broken", () => {
    expect(
      chatKeyState({ keyVersions: ["v1"], latestKeyVersion: "v1", brokenAt: new Date() }),
    ).toBe("stale");
  });

  it("is unlocked when the latest version is not yet observed", () => {
    expect(chatKeyState({ keyVersions: ["v1"], latestKeyVersion: null, brokenAt: null })).toBe(
      "unlocked",
    );
  });
});

describe("loadChatKeyState", () => {
  it("derives the state from stored rows", async () => {
    await withTestDb(async (db) => {
      const [account] = await db
        .insert(xAccounts)
        .values({ xUserId: "x-1", username: "b", displayName: "B", chatLatestKeyVersion: "v2" })
        .returning({ id: xAccounts.id });
      if (!account) throw new Error("seed failed");
      expect(await loadChatKeyState(db, account.id, sig())).toBe("locked");
      await db.insert(xAccountChatKeys).values({
        accountId: account.id,
        keyVersion: "v1",
        keysEnc: Buffer.from("k"),
        unlockedAt: new Date(),
      });
      expect(await loadChatKeyState(db, account.id, sig())).toBe("stale");
      await db.insert(xAccountChatKeys).values({
        accountId: account.id,
        keyVersion: "v2",
        keysEnc: Buffer.from("k"),
        unlockedAt: new Date(),
      });
      expect(await loadChatKeyState(db, account.id, sig())).toBe("unlocked");
    });
  });
});
