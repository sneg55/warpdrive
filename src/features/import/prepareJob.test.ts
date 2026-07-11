import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { StorageClient } from "@/features/files/storage";
import { ok } from "@/types/result";
import { handlePrepareJob } from "./prepareJob";

function storageWith(csv: string): StorageClient {
  return {
    presignPost: () => Promise.resolve(ok({ url: "", fields: {} })),
    headObject: () => Promise.resolve(ok({ size: csv.length, etag: "e", contentType: "text/csv" })),
    presignGet: () => Promise.resolve(ok("")),
    copyObject: () => Promise.resolve(ok(undefined)),
    deleteObject: () => Promise.resolve(ok(undefined)),
    getObjectBytes: () => Promise.resolve(ok(Buffer.from(csv, "utf8"))),
  };
}

it("parses the CSV, inserts rows, stores headers, lands mapping_ready", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "c.csv",
        status: "uploaded",
        s3Key: "import/x/y.csv",
        createdBy: user.id,
      })
      .returning();
    await handlePrepareJob(
      db,
      { storage: storageWith("Name,Email\nA,a@x.co\nB,b@x.co") },
      { data: { batchId: b!.id } },
      AbortSignal.timeout(5000),
    );

    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, b!.id));
    expect(after?.status).toBe("mapping_ready");
    expect(after?.headers).toEqual(["Name", "Email"]);
    expect(after?.totalRows).toBe(2);
    const rows = await db.select().from(importRows).where(eq(importRows.batchId, b!.id));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.raw).toEqual({ Name: "A", Email: "a@x.co" });
  });
});
