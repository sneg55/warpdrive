import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { files } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listFilesForEntity } from "./listFilesForEntity";

const signal = new AbortController().signal;

it("returns only ready files for the given entity, newest first", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const entityId = randomUUID();
    const otherEntityId = randomUUID();

    await db.insert(files).values([
      {
        entityType: "deal",
        entityId,
        filename: "older.pdf",
        s3Key: `deal/${entityId}/older`,
        sizeBytes: 10,
        contentType: "application/pdf",
        status: "ready",
        uploadedBy: user.id,
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
      {
        entityType: "deal",
        entityId,
        filename: "newer.pdf",
        s3Key: `deal/${entityId}/newer`,
        sizeBytes: 20,
        contentType: "application/pdf",
        status: "ready",
        uploadedBy: user.id,
        createdAt: new Date("2026-07-02T00:00:00Z"),
      },
      // Pending (uploading) row for the same entity: must be excluded.
      {
        entityType: "deal",
        entityId,
        filename: "pending.pdf",
        s3Key: `deal/${entityId}/pending`,
        sizeBytes: 30,
        contentType: "application/pdf",
        status: "uploading",
        uploadedBy: user.id,
      },
      // Ready row for a DIFFERENT entityId: must be excluded.
      {
        entityType: "deal",
        entityId: otherEntityId,
        filename: "other-entity.pdf",
        s3Key: `deal/${otherEntityId}/x`,
        sizeBytes: 40,
        contentType: "application/pdf",
        status: "ready",
        uploadedBy: user.id,
      },
      // Ready row for a different entityType, same id: must be excluded.
      {
        entityType: "person",
        entityId,
        filename: "wrong-type.pdf",
        s3Key: `person/${entityId}/x`,
        sizeBytes: 50,
        contentType: "application/pdf",
        status: "ready",
        uploadedBy: user.id,
      },
    ]);

    const result = await listFilesForEntity(db, "deal", entityId, signal);

    expect(result.map((f) => f.filename)).toEqual(["newer.pdf", "older.pdf"]);
    // Projection excludes storage internals.
    const first = result[0];
    expect(first).toMatchObject({
      filename: "newer.pdf",
      sizeBytes: 20,
      contentType: "application/pdf",
    });
    expect(first).not.toHaveProperty("s3Key");
  });
});

it("aborts before querying when the signal is already aborted", async () => {
  await withTestDb(async (db) => {
    const controller = new AbortController();
    controller.abort();
    await expect(listFilesForEntity(db, "deal", randomUUID(), controller.signal)).rejects.toThrow();
  });
});
