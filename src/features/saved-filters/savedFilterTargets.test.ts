// A saved view carries the entity it belongs to, and each entity has its own field allow-list, so
// the definition is validated against that entity rather than against the deal fields.
import { describe, expect, it } from "vitest";
import { savedFilterDefinitionSchema, saveFilterInput } from "./schemas";

const STAGE_ID = "11111111-1111-4111-8111-111111111111";
const base = { name: "My view", isShared: false };

describe("saveFilterInput per target entity", () => {
  it("accepts a deal view carrying a deal-only field", () => {
    expect(
      saveFilterInput.safeParse({
        ...base,
        targetEntity: "deal",
        definition: { conditions: [{ field: "stageId", op: "eq", value: STAGE_ID }] },
      }).success,
    ).toBe(true);
  });

  it("rejects a person view carrying a deal-only field", () => {
    expect(
      saveFilterInput.safeParse({
        ...base,
        targetEntity: "person",
        definition: { conditions: [{ field: "stageId", op: "eq", value: STAGE_ID }] },
      }).success,
    ).toBe(false);
  });

  it("accepts each entity's own fields", () => {
    const cases: Array<[string, string]> = [
      ["person", "primaryEmail"],
      ["organization", "industry"],
      ["lead", "sourceOrigin"],
    ];
    for (const [targetEntity, field] of cases) {
      expect(
        saveFilterInput.safeParse({
          ...base,
          targetEntity,
          definition: { conditions: [{ field, op: "contains", value: "x" }] },
        }).success,
      ).toBe(true);
    }
  });

  it("rejects an entity outside the four", () => {
    expect(
      saveFilterInput.safeParse({
        ...base,
        targetEntity: "activity",
        definition: { conditions: [] },
      }).success,
    ).toBe(false);
  });

  it("defaults the combinator on a person view definition", () => {
    const r = saveFilterInput.safeParse({
      ...base,
      targetEntity: "person",
      definition: { conditions: [{ field: "name", op: "contains", value: "a" }] },
    });
    expect(r.success && r.data.definition.combinator).toBe("and");
  });
});

describe("savedFilterDefinitionSchema", () => {
  it("hands back the validator for the named entity", () => {
    expect(
      savedFilterDefinitionSchema("lead").safeParse({
        conditions: [{ field: "sourceOrigin", op: "eq", value: "web" }],
      }).success,
    ).toBe(true);
    expect(
      savedFilterDefinitionSchema("lead").safeParse({
        conditions: [{ field: "industry", op: "eq", value: "web" }],
      }).success,
    ).toBe(false);
  });
});
