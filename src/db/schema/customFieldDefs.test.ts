import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { customFieldDefs } from "./index";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

it("enforces (target_entity, key) uniqueness", async () => {
  await h.db.insert(customFieldDefs).values({
    targetEntity: "deal",
    type: "single_option",
    name: "Industry",
    key: "industry",
    options: [{ id: "opt_saas", label: "SaaS" }],
  });

  // Second def with the same (target_entity, key) must be rejected by the UNIQUE.
  await expect(
    h.db.insert(customFieldDefs).values({
      targetEntity: "deal",
      type: "text",
      name: "Industry 2",
      key: "industry",
      options: [],
    }),
  ).rejects.toThrow();
});
