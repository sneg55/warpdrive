import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { hydrateActor } from "@/server/hydrateActor";
import { commitBatch } from "./batch";
import { handleCommitJob } from "./commitJob";
import { toImportActor } from "./importActor";
import { getBatchResult } from "./results";

it("no-ops on a non-ready batch (pg-boss retry after terminal/undo)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const actor = toImportActor((await hydrateActor(db, user.id, AbortSignal.timeout(5000)))!);
    // Batch already undone (undo deleted its records); a stray commit retry must not re-create.
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "c.csv",
        status: "undone",
        columnMapping: {
          dedupMode: "skip",
          columns: { Name: { field: "name", isCustom: false, key: "" } },
        },
        createdBy: user.id,
      })
      .returning();
    await db.insert(importRows).values({
      batchId: b!.id,
      rowNumber: 1,
      raw: { Name: "Ghost" },
      mapped: { primary: { name: "Ghost" } },
      status: "valid",
    });

    const r = await commitBatch(db, actor, b!.id, AbortSignal.timeout(5000));
    expect(r.ok && r.value).toMatchObject({ imported: 0 });
    expect(await db.select().from(persons).where(eq(persons.name, "Ghost"))).toHaveLength(0);
    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, b!.id));
    expect(after?.status).toBe("undone"); // claim failed, status untouched
  });
});

it("commits valid rows and reports the exact split", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "c.csv",
        status: "ready",
        totalRows: 1,
        validRows: 1,
        columnMapping: {
          dedupMode: "skip",
          columns: { Name: { field: "name", isCustom: false, key: "" } },
        },
        createdBy: user.id,
      })
      .returning();
    await db.insert(importRows).values({
      batchId: b!.id,
      rowNumber: 1,
      raw: { Name: "A" },
      mapped: { primary: { name: "A" } },
      status: "valid",
    });

    await handleCommitJob(db, { data: { batchId: b!.id } }, AbortSignal.timeout(5000));

    const created = await db.select().from(persons).where(eq(persons.name, "A"));
    expect(created).toHaveLength(1);
    const actor = toImportActor((await hydrateActor(db, user.id, AbortSignal.timeout(5000)))!);
    const res = await getBatchResult(db, actor, b!.id, AbortSignal.timeout(5000));
    expect(res.ok && res.value).toMatchObject({ imported: 1, skipped: 0, invalid: 0 });
  });
});
