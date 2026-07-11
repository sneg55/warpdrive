import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { users } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { FakeStorageClient } from "@/features/files/storageFake";
import { confirmAvatarUpload, removeAvatar, requestAvatarUpload } from "./avatarService";
import { AVATAR_MAX_BYTES, avatarObjectKey, avatarUploadKey } from "./avatarStorage";

const SIGNAL = (): AbortSignal => AbortSignal.timeout(5000);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngBytes = (extra = 8): Buffer => Buffer.from([...PNG_MAGIC, ...new Array(extra).fill(0)]);

// Simulate the browser's presigned POST landing real bytes at the stable upload key.
function putUploadObject(
  storage: FakeStorageClient,
  userId: string,
  bytes: Buffer,
  type: string,
): void {
  const key = avatarUploadKey(userId);
  storage.objectsByKey.set(key, { size: bytes.length, contentType: type });
  storage.objectBytes.set(key, bytes);
}

describe("requestAvatarUpload", () => {
  it("rejects a non-image content type without presigning", async () => {
    const storage = new FakeStorageClient();
    const r = await requestAvatarUpload(
      { actor: { id: "u1" }, storage, input: { contentType: "application/pdf", size: 100 } },
      SIGNAL(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.USER_AVATAR_INVALID);
    expect(storage.calls.some((c) => c.method === "presignPost")).toBe(false);
  });

  it("rejects an oversize file without presigning", async () => {
    const storage = new FakeStorageClient();
    const r = await requestAvatarUpload(
      {
        actor: { id: "u1" },
        storage,
        input: { contentType: "image/png", size: AVATAR_MAX_BYTES + 1 },
      },
      SIGNAL(),
    );
    expect(r.ok).toBe(false);
    expect(storage.calls.some((c) => c.method === "presignPost")).toBe(false);
  });

  it("presigns a POST pinned to the actor's own upload key with the 2 MB cap", async () => {
    const storage = new FakeStorageClient();
    const r = await requestAvatarUpload(
      { actor: { id: "u1" }, storage, input: { contentType: "image/png", size: 1000 } },
      SIGNAL(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.post.fields.key).toBe(avatarUploadKey("u1"));
    // The storage layer, not just the client, must enforce the avatar cap.
    const presign = storage.calls.find((c) => c.method === "presignPost");
    expect(presign?.args.maxBytes).toBe(AVATAR_MAX_BYTES);
  });
});

describe("confirmAvatarUpload", () => {
  it("copies a valid image to the confirmed key and sets a versioned avatar_url", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const storage = new FakeStorageClient();
      putUploadObject(storage, me.id, pngBytes(), "image/png");

      const r = await confirmAvatarUpload(db, { actor: { id: me.id }, storage }, SIGNAL());
      expect(r.ok).toBe(true);

      expect(storage.objectsByKey.has(avatarObjectKey(me.id))).toBe(true);
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      expect(row?.avatarUrl).toContain(`/api/users/${me.id}/avatar?v=`);
    });
  });

  it("rejects (and cleans up) an object whose REAL bytes are not an image, despite an image content-type", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const storage = new FakeStorageClient();
      // Attacker declared image/png at request (which the POST policy pins as the stored type),
      // but the actual bytes are a PDF. Only byte-sniffing catches this.
      putUploadObject(storage, me.id, Buffer.from("%PDF-1.7\nmalicious"), "image/png");

      const r = await confirmAvatarUpload(db, { actor: { id: me.id }, storage }, SIGNAL());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.USER_AVATAR_INVALID);
      // Validated before the copy: the upload object is removed and the confirmed key (the user's
      // current avatar) is never written with the bad bytes.
      expect(storage.deletedKeys).toContain(avatarUploadKey(me.id));
      expect(storage.objectsByKey.has(avatarObjectKey(me.id))).toBe(false);
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      expect(row?.avatarUrl).toBeNull();
    });
  });

  it("rejects an object that exceeds the size cap on its real bytes", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const storage = new FakeStorageClient();
      putUploadObject(storage, me.id, pngBytes(AVATAR_MAX_BYTES), "image/png");

      const r = await confirmAvatarUpload(db, { actor: { id: me.id }, storage }, SIGNAL());
      expect(r.ok).toBe(false);
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      expect(row?.avatarUrl).toBeNull();
    });
  });
});

describe("removeAvatar", () => {
  it("clears avatar_url and deletes the confirmed object", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, { avatarUrl: `/api/users/x/avatar?v=1` });
      const storage = new FakeStorageClient();
      storage.objectsByKey.set(avatarObjectKey(me.id), { size: 10, contentType: "image/png" });

      const r = await removeAvatar(db, { actor: { id: me.id }, storage }, SIGNAL());
      expect(r.ok).toBe(true);
      expect(storage.deletedKeys).toContain(avatarObjectKey(me.id));
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      expect(row?.avatarUrl).toBeNull();
    });
  });
});
