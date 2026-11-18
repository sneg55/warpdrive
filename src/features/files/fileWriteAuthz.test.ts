import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { files } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { confirmUpload, requestDownload, requestUpload } from "./actions";
import {
  actorFor,
  readerFor,
  seedArchivedDeal,
  seedOwnerDeal,
  seedPublicDeal,
  signal,
} from "./actions.test-helpers";
import { FakeStorageClient } from "./storageFake";

describe("file write authorization", () => {
  it("refuses upload to a visible parent when the actor lacks write capability", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const dealId = await seedPublicDeal(db, owner.id);

      const r = await requestUpload(
        db,
        {
          actor: readerFor(viewer.id),
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

  it("refuses upload to a deal in an archived pipeline", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const dealId = await seedArchivedDeal(db, owner.id);

      const r = await requestUpload(
        db,
        {
          actor: actorFor(owner.id),
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

  it("refuses download of a file attached to a deal in an archived pipeline", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const dealId = await seedArchivedDeal(db, owner.id);
      const storage = new FakeStorageClient();

      const [row] = await db
        .insert(files)
        .values({
          entityType: "deal",
          entityId: dealId,
          filename: "a.pdf",
          contentType: "application/pdf",
          sizeBytes: 100,
          s3Key: "deal/x/a.pdf",
          status: "ready",
          uploadedBy: owner.id,
        })
        .returning();
      if (!row) throw new Error("insert failed");

      const r = await requestDownload(
        db,
        { actor: actorFor(owner.id), storage, fileId: row.id },
        signal,
      );

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_PERM_001");
      expect(storage.calls.some((c) => c.method === "presignGet")).toBe(false);
    });
  });

  it("serves the immutable confirmed copy even if the upload key is overwritten after confirm", async () => {
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

      const [beforeRow] = await db.select().from(files).where(eq(files.id, up.value.fileId));
      const uploadKey = beforeRow!.s3Key;
      storage.objectsByKey.set(uploadKey, {
        size: 100,
        contentType: "application/pdf",
        etag: "genuine-etag",
      });
      const done = await confirmUpload(
        db,
        { actor: actorFor(owner.id), storage, fileId: up.value.fileId },
        signal,
      );
      expect(done.ok).toBe(true);

      const [afterRow] = await db.select().from(files).where(eq(files.id, up.value.fileId));
      expect(afterRow!.s3Key).not.toBe(uploadKey);
      expect(afterRow!.s3Key.startsWith("confirmed/")).toBe(true);

      storage.objectsByKey.set(uploadKey, {
        size: 100,
        contentType: "application/pdf",
        etag: "overwritten-etag",
      });

      const dl = await requestDownload(
        db,
        { actor: actorFor(owner.id), storage, fileId: up.value.fileId },
        signal,
      );
      expect(dl.ok).toBe(true);
      const getCalls = storage.calls.filter((c) => c.method === "presignGet");
      expect(getCalls.every((c) => c.args.key === afterRow!.s3Key)).toBe(true);
      expect(getCalls.some((c) => c.args.key === uploadKey)).toBe(false);
    });
  });

  it("refuses to download a file that is not yet ready", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const dealId = await seedOwnerDeal(db, owner.id);
      const storage = new FakeStorageClient();

      const [row] = await db
        .insert(files)
        .values({
          entityType: "deal",
          entityId: dealId,
          filename: "a.pdf",
          contentType: "application/pdf",
          sizeBytes: 100,
          s3Key: "deal/x/a.pdf",
          status: "uploading",
          uploadedBy: owner.id,
        })
        .returning();
      if (!row) throw new Error("insert failed");

      const r = await requestDownload(
        db,
        { actor: actorFor(owner.id), storage, fileId: row.id },
        signal,
      );

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe(ERROR_IDS.FILE_PRESIGN_INVALID);
      expect(storage.calls.some((c) => c.method === "presignGet")).toBe(false);
    });
  });
});
