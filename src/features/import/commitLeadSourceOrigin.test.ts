import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows, leads } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { MappedRow } from "@/types/import";
import { commitRow, type ImportActor } from "./commit";

function adminActorFor(id: string): ImportActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(),
  };
}

async function seedLeadRow(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  userId: string,
  mapped: MappedRow,
): Promise<{ id: string }> {
  const [batch] = await db
    .insert(importBatches)
    .values({ targetEntity: "lead", filename: "l.csv", createdBy: userId })
    .returning();
  if (batch === undefined) throw new Error("batch seed failed");
  const [row] = await db
    .insert(importRows)
    .values({ batchId: batch.id, rowNumber: 1, raw: {}, mapped, status: "valid" })
    .returning();
  if (row === undefined) throw new Error("row seed failed");
  return row;
}

it("records an imported lead's source origin as 'imported', not 'manually_created'", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedLeadRow(db, user.id, { primary: { title: "Imported origin lead" } });
    await commitRow(db, actor, row.id, "lead", "skip", signal);

    const created = await db.select().from(leads).where(eq(leads.title, "Imported origin lead"));
    expect(created[0]?.sourceOrigin).toBe("imported");
  });
});
