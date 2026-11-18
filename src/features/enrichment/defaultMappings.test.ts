import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { DEFAULT_BUILTIN_MAPPINGS } from "./canonical";
import { listMappings } from "./mappingsRepo";

let h: TestDb;
const SIG = (): AbortSignal => AbortSignal.timeout(20_000);

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

describe("default mappings on a fresh database", () => {
  it("maps the organization built-ins the migration seeds", async () => {
    const rows = await listMappings(h.db, "organization", SIG());
    const byKey = new Map(rows.map((r) => [r.canonicalKey, r.targetKey]));
    expect(byKey.get("org.domain")).toBe("domain");
    expect(byKey.get("org.industry")).toBe("industry");
    expect(byKey.get("org.employeeCount")).toBe("employeeCount");
    expect(byKey.get("org.annualRevenue")).toBe("annualRevenue");
    expect(byKey.get("org.linkedinUrl")).toBe("linkedinUrl");
  });

  it("uses the import mapper's address leaf names", async () => {
    const rows = await listMappings(h.db, "organization", SIG());
    const byKey = new Map(rows.map((r) => [r.canonicalKey, r.targetKey]));
    expect(byKey.get("org.state")).toBe("address.region");
    expect(byKey.get("org.postalCode")).toBe("address.postal");
  });

  it("maps the two person built-ins that exist", async () => {
    const rows = await listMappings(h.db, "person", SIG());
    const byKey = new Map(rows.map((r) => [r.canonicalKey, r.targetKey]));
    expect(byKey.get("person.email")).toBe("emails");
    expect(byKey.get("person.companyName")).toBe("org");
  });

  it("seeds exactly what DEFAULT_BUILTIN_MAPPINGS declares", async () => {
    const seeded = new Map<string, string | null>();
    for (const entity of ["person", "organization"] as const) {
      for (const row of await listMappings(h.db, entity, SIG())) {
        seeded.set(row.canonicalKey, row.targetKey);
      }
    }
    expect(Object.fromEntries(seeded)).toEqual(DEFAULT_BUILTIN_MAPPINGS);
  });
});
