import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { listMappings, upsertMapping } from "./mappingsRepo";

let h: TestDb;
// The migrated state, captured before any test writes to the table.
let seeded: Awaited<ReturnType<typeof listMappings>>;
const signal = new AbortController().signal;

beforeAll(async () => {
  h = await makeTestDb();
  seeded = await listMappings(h.db, "person", signal);
});
afterAll(async () => {
  await h.close();
});

describe("default mappings: person name parts", () => {
  it("point each part at its own column on a fresh install", () => {
    expect(seeded.find((m) => m.canonicalKey === "person.firstName")?.targetKey).toBe("firstName");
    expect(seeded.find((m) => m.canonicalKey === "person.lastName")?.targetKey).toBe("lastName");
  });
});

describe("upsertMapping: person name parts", () => {
  it("accepts firstName and lastName as targets of their own", async () => {
    const first = await upsertMapping(
      h.db,
      "person",
      "person.firstName",
      { kind: "builtin", key: "firstName" },
      signal,
    );
    const last = await upsertMapping(
      h.db,
      "person",
      "person.lastName",
      { kind: "builtin", key: "lastName" },
      signal,
    );

    expect(first.ok).toBe(true);
    expect(last.ok).toBe(true);
    const mapped = await listMappings(h.db, "person", signal);
    expect(mapped.find((m) => m.canonicalKey === "person.firstName")?.targetKey).toBe("firstName");
    expect(mapped.find((m) => m.canonicalKey === "person.lastName")?.targetKey).toBe("lastName");
  });
});
