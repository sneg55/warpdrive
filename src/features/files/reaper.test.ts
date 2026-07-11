import { randomUUID } from "node:crypto";
import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { files } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { reapStaleUploads } from "./reaper";
import { FakeStorageClient } from "./storageFake";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Insert the three fixture rows: one stale uploading, one ready, one recent
// uploading. entity_id has no FK, so a random uuid is enough to satisfy NOT NULL.
async function seedFixtures(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  userId: string,
): Promise<void> {
  const old = new Date(Date.now() - TWO_HOURS_MS);
  await db.insert(files).values([
    {
      entityType: "deal",
      entityId: randomUUID(),
      filename: "a.pdf",
      s3Key: "k-stale",
      sizeBytes: 1,
      contentType: "application/pdf",
      status: "uploading",
      uploadedBy: userId,
      createdAt: old,
    },
    {
      entityType: "deal",
      entityId: randomUUID(),
      filename: "c.pdf",
      s3Key: "k-ready",
      sizeBytes: 1,
      contentType: "application/pdf",
      status: "ready",
      uploadedBy: userId,
      createdAt: old,
    },
    {
      entityType: "deal",
      entityId: randomUUID(),
      filename: "b.pdf",
      s3Key: "k-recent",
      sizeBytes: 1,
      contentType: "application/pdf",
      status: "uploading",
      uploadedBy: userId,
      createdAt: new Date(),
    },
  ]);
}

describe("reapStaleUploads", () => {
  it("deletes stale uploading rows and their objects, keeps ready + recent", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      await seedFixtures(db, user.id);

      const storage = new FakeStorageClient();
      const out = await reapStaleUploads(db, {
        storage,
        signal: new AbortController().signal,
      });

      expect(out.deleted).toBe(1);
      const remaining = (
        await db.select({ key: files.s3Key }).from(files).orderBy(asc(files.s3Key))
      ).map((r) => r.key);
      expect(remaining).toEqual(["k-ready", "k-recent"]);
      expect(storage.deletedKeys).toContain("k-stale");
    });
  });

  it("keeps a row whose object delete fails, excluding it from the count", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      await seedFixtures(db, user.id);

      const storage = new FakeStorageClient();
      // Force the stale object's delete to fail: object-first means the row is
      // left intact and the failure must not abort the batch or throw.
      storage.failDeleteKeys.add("k-stale");

      const out = await reapStaleUploads(db, {
        storage,
        signal: new AbortController().signal,
      });

      expect(out.deleted).toBe(0);
      const remaining = (
        await db.select({ key: files.s3Key }).from(files).orderBy(asc(files.s3Key))
      ).map((r) => r.key);
      expect(remaining).toEqual(["k-ready", "k-recent", "k-stale"]);
    });
  });
});
