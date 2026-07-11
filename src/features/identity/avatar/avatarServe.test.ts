import { describe, expect, it } from "vitest";
import { FakeStorageClient } from "@/features/files/storageFake";
import { resolveAvatarBytes } from "./avatarServe";
import { avatarObjectKey } from "./avatarStorage";

const USER = "33333333-3333-4333-8333-333333333333";
const SIGNAL = (): AbortSignal => AbortSignal.timeout(5000);

describe("resolveAvatarBytes", () => {
  it("returns the object bytes and content type for a stored avatar", async () => {
    const storage = new FakeStorageClient();
    const key = avatarObjectKey(USER);
    storage.objectsByKey.set(key, { size: 3, contentType: "image/png" });
    storage.objectBytes.set(key, Buffer.from([1, 2, 3]));

    const r = await resolveAvatarBytes(storage, USER, SIGNAL());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.contentType).toBe("image/png");
      expect(Array.from(r.value.bytes)).toEqual([1, 2, 3]);
    }
  });

  it("errors when the user has no stored avatar object", async () => {
    const storage = new FakeStorageClient();
    const r = await resolveAvatarBytes(storage, USER, SIGNAL());
    expect(r.ok).toBe(false);
  });

  it("rejects a non-uuid userId before touching storage", async () => {
    const storage = new FakeStorageClient();
    const r = await resolveAvatarBytes(storage, "../secrets", SIGNAL());
    expect(r.ok).toBe(false);
    expect(storage.calls.length).toBe(0);
  });
});
