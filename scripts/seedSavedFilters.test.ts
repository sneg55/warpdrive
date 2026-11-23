import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSavedFilterSeeds } from "./seed-demo-collab";

interface SavedFilterAuditInput {
  id: string;
  name: string;
  targetEntity: string;
  definition: Record<string, unknown>;
}

type AnalyzeSavedFilter = (input: SavedFilterAuditInput) => string | null;

const auditConfigSpecifier = "./auditConfig";
const hasAuditConfig = existsSync(new URL("./auditConfig.ts", import.meta.url));
const analyzeSavedFilter: AnalyzeSavedFilter | undefined = hasAuditConfig
  ? ((await import(auditConfigSpecifier)) as { analyzeSavedFilter: AnalyzeSavedFilter })
      .analyzeSavedFilter
  : undefined;

describe("buildSavedFilterSeeds", () => {
  const userIds = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"];

  it("emits only deal-target filters (activities do not consume saved_filters)", () => {
    for (const s of buildSavedFilterSeeds(userIds)) {
      expect(s.target).toBe("deal");
    }
  });

  it.skipIf(!hasAuditConfig)(
    "every seeded definition conforms to the filter schema (no lossy/invalid/degenerate)",
    () => {
      for (const s of buildSavedFilterSeeds(userIds)) {
        const issue = analyzeSavedFilter?.({
          id: s.name,
          name: s.name,
          targetEntity: s.target,
          definition: s.def,
        });
        expect(issue, `filter "${s.name}" should be conformant`).toBeNull();
      }
    },
  );

  it('"My open deals" narrows to the owner\'s open deals', () => {
    const seeds = buildSavedFilterSeeds(userIds);
    const mine = seeds.find((s) => s.name === "My open deals");
    expect(mine).toBeDefined();
    expect(mine?.def).toEqual({
      conditions: [
        { field: "status", op: "eq", value: "open" },
        { field: "ownerId", op: "eq", value: userIds[0] },
      ],
    });
    expect(mine?.ownerId).toBe(userIds[0]);
  });

  it("returns no rows when there are no users", () => {
    expect(buildSavedFilterSeeds([])).toEqual([]);
  });
});

describe.skipIf(!hasAuditConfig)("analyzeSavedFilter", () => {
  const base = { id: "f1", name: "Bad", targetEntity: "deal" };

  it("rejects a condition with an unknown field", () => {
    expect(
      analyzeSavedFilter?.({
        ...base,
        definition: { conditions: [{ field: "nope", op: "eq", value: "x" }] },
      }),
    ).not.toBeNull();
  });

  it("rejects an operator that is missing its value", () => {
    expect(
      analyzeSavedFilter?.({
        ...base,
        definition: { conditions: [{ field: "status", op: "eq" }] },
      }),
    ).not.toBeNull();
  });

  it("rejects a definition that neither filters nor marks rotting", () => {
    expect(analyzeSavedFilter?.({ ...base, definition: {} })).not.toBeNull();
    expect(analyzeSavedFilter?.({ ...base, definition: { conditions: [] } })).not.toBeNull();
  });

  it("accepts a definition that conforms to the schema", () => {
    expect(
      analyzeSavedFilter?.({
        ...base,
        definition: { conditions: [{ field: "status", op: "eq", value: "open" }] },
      }),
    ).toBeNull();
  });
});
