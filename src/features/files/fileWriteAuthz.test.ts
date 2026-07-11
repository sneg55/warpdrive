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
  // Codex finding F18: requestUpload was authorized by read visibility only. The ops spec
  // (C2 step 2) requires canSee AND the entity's write/upload capability, so a read-only
  // actor who can SEE a record must not be able to attach files to it, and no row is written.
  it("refuses upload to a visible parent when the actor lacks write capability", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      // 'all'-visibility deal: the viewer can SEE it but holds no edit capability.
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

  // Codex finding F24: the deal-parent file authz path joined pipelines only for the
  // visibility group, never checking is_archived. Archived-pipeline deals are hidden from
  // every read, so neither uploads nor downloads may target their attachments.
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

      // A 'ready' file already attached (e.g. before the pipeline was archived).
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

  // Codex finding F33: a presigned POST stays valid for the upload key for its whole TTL,
  // so the uploader can overwrite the object AFTER confirmUpload validated it. An ETag
  // re-check on the SAME mutable key only narrows the TOCTOU window; it does not close it.
  // The fix makes the confirmed object immutable: confirm copies it to a 'confirmed/' key
  // the upload POST policy can never target, and downloads serve ONLY that key. So an
  // overwrite of the original upload key cannot change what a recipient receives.
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
      // The browser POST lands at the upload key; confirm copies it to the immutable key.
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

      // The served key is now an immutable 'confirmed/' key, distinct from the upload key.
      const [afterRow] = await db.select().from(files).where(eq(files.id, up.value.fileId));
      expect(afterRow!.s3Key).not.toBe(uploadKey);
      expect(afterRow!.s3Key.startsWith("confirmed/")).toBe(true);

      // The uploader reuses the still-valid POST to overwrite the ORIGINAL upload key.
      storage.objectsByKey.set(uploadKey, {
        size: 100,
        contentType: "application/pdf",
        etag: "overwritten-etag",
      });

      // Download still succeeds and serves the immutable confirmed key, never the upload key.
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

  // Codex finding F19: downloads require status='ready' (data model). An uploading
  // (unconfirmed) object has not passed the confirmUpload HEAD size/content-type check, so
  // it must NOT be downloadable even by an actor who can see the parent, and no GET is minted.
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
