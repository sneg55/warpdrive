import { expect, it } from "vitest";
import { importBatches } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { authorizeSubscribe } from "./authorize";

function conn(userId: string) {
  return { userId, isActive: true } as Parameters<typeof authorizeSubscribe>[1];
}

it("allows the batch owner and denies everyone else", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, {});
    const other = await seedUser(db, {});
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "x.csv",
        status: "uploaded",
        createdBy: owner.id,
      })
      .returning();
    const ch = `import:${b!.id}`;
    const sig = AbortSignal.timeout(5000);
    expect((await authorizeSubscribe(db, conn(owner.id), ch, sig)).ok).toBe(true);
    expect((await authorizeSubscribe(db, conn(other.id), ch, sig)).ok).toBe(false);
    expect(
      (
        await authorizeSubscribe(
          db,
          conn(owner.id),
          "import:00000000-0000-0000-0000-000000000000",
          sig,
        )
      ).ok,
    ).toBe(false);
  });
});
