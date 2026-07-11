import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { handleValidateJob } from "./validateJob";

it("no-ops on a terminal batch (a stale validate retry must not regress it to ready)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "c.csv",
        status: "completed",
        columnMapping: {
          dedupMode: "skip",
          columns: { Name: { field: "name", isCustom: false, key: "" } },
        },
        createdBy: user.id,
      })
      .returning();

    await handleValidateJob(db, { data: { batchId: b!.id } }, AbortSignal.timeout(5000));

    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, b!.id));
    expect(after?.status).toBe("completed"); // not regressed to "ready"
  });
});

it("validates rows as the batch owner and lands ready", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "c.csv",
        status: "mapping_ready",
        totalRows: 2,
        columnMapping: {
          dedupMode: "skip",
          columns: { Name: { field: "name", isCustom: false, key: "" } },
        },
        createdBy: user.id,
      })
      .returning();
    await db.insert(importRows).values([
      { batchId: b!.id, rowNumber: 1, raw: { Name: "A" }, status: "pending" },
      { batchId: b!.id, rowNumber: 2, raw: { Name: "" }, status: "pending" },
    ]);

    await handleValidateJob(db, { data: { batchId: b!.id } }, AbortSignal.timeout(5000));

    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, b!.id));
    expect(after?.status).toBe("ready");
    expect(after?.validRows).toBe(1);
    expect(after?.errorRows).toBe(1);
  });
});
