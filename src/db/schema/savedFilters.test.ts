import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb, type TestDb } from "@/test/db";
import { savedFilters } from "./savedFilters";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

describe("savedFilters schema", () => {
  it("stores a filter definition as jsonb", async () => {
    const u = await seedUser(h.db);
    const [f] = await h.db
      .insert(savedFilters)
      .values({
        name: "My open",
        targetEntity: "deal",
        ownerId: u.id,
        definition: {
          conditions: [{ field: "status", op: "eq", value: "open" }],
        },
      })
      .returning();

    expect(f?.isShared).toBe(false);
    expect((f?.definition as { conditions: unknown[] }).conditions).toHaveLength(1);
  });

  it("rejects a saved filter with a non-existent owner", async () => {
    const fakeUuid = "550e8400-e29b-41d4-a716-446655440000";
    await expect(
      h.db
        .insert(savedFilters)
        .values({
          name: "Invalid owner",
          targetEntity: "deal",
          ownerId: fakeUuid,
          definition: {},
        })
        .returning(),
    ).rejects.toThrow();
  });
});
