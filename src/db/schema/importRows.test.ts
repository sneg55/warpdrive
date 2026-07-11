import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { users } from "./identity";
import { importBatches, importRows } from "./index";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

it("enforces (batch_id, row_number) uniqueness as the idempotency guard", async () => {
  // import_batches.created_by is a NOT NULL FK to users; seed a real user first.
  const [u] = await h.db
    .insert(users)
    .values({ email: "i@test.com", name: "I", googleSub: "sub-i" })
    .returning();

  const [batch] = await h.db
    .insert(importBatches)
    .values({ targetEntity: "person", filename: "people.csv", createdBy: u!.id })
    .returning();

  await h.db.insert(importRows).values({ batchId: batch!.id, rowNumber: 1, raw: { name: "A" } });

  // A second row with the same (batch_id, row_number) must be rejected.
  await expect(
    h.db.insert(importRows).values({ batchId: batch!.id, rowNumber: 1, raw: { name: "B" } }),
  ).rejects.toThrow();
});
