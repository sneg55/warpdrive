import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { StorageClient } from "@/features/files/storage";
import { ok } from "@/types/result";
import { confirmImportUpload, requestImportUpload } from "./upload";

// Minimal inline StorageClient fake: only the methods the upload path uses.
function fakeStorage(over: Partial<StorageClient> = {}): StorageClient {
  return {
    presignPost: () => Promise.resolve(ok({ url: "http://garage/put", fields: { key: "k" } })),
    headObject: () => Promise.resolve(ok({ size: 10, etag: "e", contentType: "text/csv" })),
    presignGet: () => Promise.resolve(ok("http://get")),
    copyObject: () => Promise.resolve(ok(undefined)),
    deleteObject: () => Promise.resolve(ok(undefined)),
    getObjectBytes: () => Promise.resolve(ok(Buffer.from("Name\nA"))),
    ...over,
  };
}

it("creates a draft batch and returns a presigned post", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const r = await requestImportUpload(
      db,
      {
        actorId: user.id,
        storage: fakeStorage(),
        input: { targetEntity: "person", filename: "c.csv", contentType: "text/csv", size: 10 },
      },
      AbortSignal.timeout(5000),
    );
    expect(r.ok).toBe(true);
    const [b] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, r.ok ? r.value.batchId : ""));
    expect(b?.status).toBe("uploaded");
    expect(b?.s3Key).toContain("import/");
  });
});

it("confirm denies a non-owner and rejects an oversized object", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, {});
    const other = await seedUser(db, {});
    const req = await requestImportUpload(
      db,
      {
        actorId: owner.id,
        storage: fakeStorage(),
        input: { targetEntity: "person", filename: "c.csv", contentType: "text/csv", size: 10 },
      },
      AbortSignal.timeout(5000),
    );
    const batchId = req.ok ? req.value.batchId : "";
    const notOwner = await confirmImportUpload(
      db,
      { actorId: other.id, storage: fakeStorage(), batchId },
      AbortSignal.timeout(5000),
    );
    expect(notOwner.ok).toBe(false);
    const huge = fakeStorage({
      headObject: () =>
        Promise.resolve(ok({ size: 999_999_999, etag: "e", contentType: "text/csv" })),
    });
    const tooBig = await confirmImportUpload(
      db,
      { actorId: owner.id, storage: huge, batchId },
      AbortSignal.timeout(5000),
    );
    expect(tooBig.ok).toBe(false);
  });
});

it("stores the source on the batch and defaults it to csv", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const base = {
      targetEntity: "deal",
      filename: "d.csv",
      contentType: "text/csv",
      size: 10,
    } as const;
    const pd = await requestImportUpload(
      db,
      { actorId: user.id, storage: fakeStorage(), input: { ...base, source: "pipedrive" } },
      AbortSignal.timeout(5000),
    );
    const plain = await requestImportUpload(
      db,
      { actorId: user.id, storage: fakeStorage(), input: base },
      AbortSignal.timeout(5000),
    );
    const sourceOf = async (r: typeof pd): Promise<string | undefined> => {
      const [b] = await db
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, r.ok ? r.value.batchId : ""));
      return b?.source;
    };
    expect(await sourceOf(pd)).toBe("pipedrive");
    expect(await sourceOf(plain)).toBe("csv");
  });
});

it("rejects an unknown source", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const input = {
      targetEntity: "deal",
      filename: "d.csv",
      contentType: "text/csv",
      size: 10,
      source: "salesforce",
    } as unknown as Parameters<typeof requestImportUpload>[1]["input"];
    await expect(
      requestImportUpload(
        db,
        { actorId: user.id, storage: fakeStorage(), input },
        AbortSignal.timeout(5000),
      ),
    ).rejects.toThrow();
  });
});

it("accepts the note target for pipedrive and rejects it for csv", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const input = {
      targetEntity: "note",
      filename: "n.csv",
      contentType: "text/csv",
      size: 10,
    } as const;
    const pd = await requestImportUpload(
      db,
      { actorId: user.id, storage: fakeStorage(), input: { ...input, source: "pipedrive" } },
      AbortSignal.timeout(5000),
    );
    expect(pd.ok).toBe(true);
    await expect(
      requestImportUpload(
        db,
        { actorId: user.id, storage: fakeStorage(), input },
        AbortSignal.timeout(5000),
      ),
    ).rejects.toThrow();
  });
});
