import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { files } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { confirmUpload, requestDownload, requestUpload } from "./actions";
import { actorFor, seedOwnerDeal, signal } from "./actions.test-helpers";
import { FakeStorageClient } from "./storageFake";

describe("file actions", () => {
  it("refuses to presign for a parent the actor cannot see (E_PERM, no row)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const dealId = await seedOwnerDeal(db, owner.id);

      const r = await requestUpload(
        db,
        {
          actor: actorFor(other.id),
          storage: new FakeStorageClient(),
          input: {
            entityType: "deal",
            entityId: dealId,
            filename: "a.pdf",
            contentType: "application/pdf",
            size: 100,
          },
        },
        signal,
      );

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_PERM_001");

      const count = (await db.execute(sql`SELECT count(*)::int AS n FROM files`)).rows[0] as {
        n: number;
      };
      expect(count.n).toBe(0);
    });
  });

  it("round-trips upload then confirm flips status to ready", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const dealId = await seedOwnerDeal(db, owner.id);
      const storage = new FakeStorageClient();

      const up = await requestUpload(
        db,
        {
          actor: actorFor(owner.id),
          storage,
          input: {
            entityType: "deal",
            entityId: dealId,
            filename: "a.pdf",
            contentType: "application/pdf",
            size: 100,
          },
        },
        signal,
      );
      expect(up.ok).toBe(true);
      if (!up.ok) return;
      expect(up.value.post.url).toContain("fake-storage");

      const [row] = await db.select().from(files).where(eq(files.id, up.value.fileId));
      expect(row?.status).toBe("uploading");
      const key = row?.s3Key;
      if (key === undefined) throw new Error("no s3Key");

      // Simulate the browser POST landing in storage with matching metadata.
      storage.objectsByKey.set(key, { size: 100, contentType: "application/pdf" });

      const done = await confirmUpload(
        db,
        { actor: actorFor(owner.id), storage, fileId: up.value.fileId },
        signal,
      );
      expect(done.ok).toBe(true);
      if (!done.ok) return;
      expect(done.value.status).toBe("ready");

      const [after] = await db.select().from(files).where(eq(files.id, up.value.fileId));
      expect(after?.status).toBe("ready");
    });
  });

  it("rejects an executable content-type at the boundary (no DB write)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const dealId = await seedOwnerDeal(db, owner.id);

      const r = await requestUpload(
        db,
        {
          actor: actorFor(owner.id),
          storage: new FakeStorageClient(),
          // Cast through unknown: the executable content-type is not in the TS
          // enum on purpose, so we test that the Zod boundary rejects it.
          input: {
            entityType: "deal",
            entityId: dealId,
            filename: "x.exe",
            contentType: "application/x-msdownload",
            size: 100,
          } as unknown as Parameters<typeof requestUpload>[1]["input"],
        },
        signal,
      );

      expect(r.ok).toBe(false);
      const count = (await db.execute(sql`SELECT count(*)::int AS n FROM files`)).rows[0] as {
        n: number;
      };
      expect(count.n).toBe(0);
    });
  });

  it("deletes the object and returns E_FILE_002 on a confirm metadata mismatch", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const dealId = await seedOwnerDeal(db, owner.id);
      const storage = new FakeStorageClient();

      const up = await requestUpload(
        db,
        {
          actor: actorFor(owner.id),
          storage,
          input: {
            entityType: "deal",
            entityId: dealId,
            filename: "a.pdf",
            contentType: "application/pdf",
            size: 100,
          },
        },
        signal,
      );
      expect(up.ok).toBe(true);
      if (!up.ok) return;

      const [row] = await db.select().from(files).where(eq(files.id, up.value.fileId));
      const key = row?.s3Key;
      if (key === undefined) throw new Error("no s3Key");

      // HEAD reports a different size than the row's sizeBytes: tamper detected.
      storage.objectsByKey.set(key, { size: 999, contentType: "application/pdf" });

      const done = await confirmUpload(
        db,
        { actor: actorFor(owner.id), storage, fileId: up.value.fileId },
        signal,
      );
      expect(done.ok).toBe(false);
      if (done.ok) return;
      expect(done.error.id).toBe("E_FILE_002");

      const deleted = storage.calls.some((c) => c.method === "deleteObject" && c.args.key === key);
      expect(deleted).toBe(true);

      const [after] = await db.select().from(files).where(eq(files.id, up.value.fileId));
      expect(after?.status).toBe("uploading");
    });
  });

  // --- Zod boundary gap fix (Task-23 Part B) ---
  // confirmUpload and requestDownload must return a Result err (E_FILE_001) for
  // non-uuid fileId values instead of throwing a Postgres uuid-cast error.

  it("confirmUpload returns E_FILE_001 err for a non-uuid fileId (no throw)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = actorFor(owner.id);
      const storage = new FakeStorageClient();

      const r = await confirmUpload(db, { actor, storage, fileId: "not-a-uuid" }, signal);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe(ERROR_IDS.FILE_PRESIGN_INVALID);
    });
  });

  it("requestDownload returns E_FILE_001 err for a non-uuid fileId (no throw)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = actorFor(owner.id);
      const storage = new FakeStorageClient();

      const r = await requestDownload(db, { actor, storage, fileId: "not-a-uuid" }, signal);

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe(ERROR_IDS.FILE_PRESIGN_INVALID);
    });
  });
});
