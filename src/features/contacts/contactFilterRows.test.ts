import { describe, expect, it } from "vitest";
import { PERSON_FILTER_CONFIG } from "./contactFilter";
import { type BuilderRow, OP_LABELS, rowsToDefinition } from "./contactFilterRows";

describe("rowsToDefinition", () => {
  const rows = (r: BuilderRow[]) => r;

  it("drops incomplete rows (blank value) and keeps valid ones", () => {
    const def = rowsToDefinition(
      "and",
      rows([
        { field: "name", op: "contains", value: "acme" },
        { field: "primaryEmail", op: "contains", value: "" },
      ]),
      PERSON_FILTER_CONFIG,
    );
    expect(def).toEqual({
      combinator: "and",
      conditions: [{ field: "name", op: "contains", value: "acme" }],
    });
  });

  it("returns null when no row is complete (a no-op filter)", () => {
    expect(
      rowsToDefinition(
        "and",
        rows([{ field: "name", op: "contains", value: "  " }]),
        PERSON_FILTER_CONFIG,
      ),
    ).toBeNull();
    expect(rowsToDefinition("and", rows([]), PERSON_FILTER_CONFIG)).toBeNull();
  });

  it("drops rows whose op is not allowed for the field (defense in depth)", () => {
    const def = rowsToDefinition(
      "or",
      rows([{ field: "ownerId", op: "contains", value: "x" }]),
      PERSON_FILTER_CONFIG,
    );
    expect(def).toBeNull();
  });

  it("exposes human labels for every operator", () => {
    expect(OP_LABELS.contains).toBe("contains");
    expect(OP_LABELS.eq).toBeDefined();
  });
});
