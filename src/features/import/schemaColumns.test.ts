import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";

it("persists the new batch columns and statuses", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const [batch] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "x.csv",
        status: "mapping_ready",
        processedRows: 3,
        headers: ["Name", "Email"],
        previewRows: [{ Name: "A", Email: "a@x.co" }],
        createdBy: user.id,
      })
      .returning();
    expect(batch?.status).toBe("mapping_ready");
    expect(batch?.processedRows).toBe(3);
    expect(batch?.headers).toEqual(["Name", "Email"]);
    expect(batch?.undoneAt).toBeNull();

    await db
      .update(importBatches)
      .set({ undoneAt: new Date() })
      .where(eq(importBatches.id, batch!.id));
    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(after?.undoneAt).not.toBeNull();
  });
});
