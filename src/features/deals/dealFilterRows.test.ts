import { describe, expect, it } from "vitest";
import { dealRowsToDefinition } from "./dealFilterRows";

describe("dealRowsToDefinition", () => {
  it("compiles non-blank rows into a deal filter definition", () => {
    const def = dealRowsToDefinition([
      { field: "value", op: "gt", value: "1000" },
      { field: "title", op: "contains", value: "acme" },
    ]);
    expect(def).toEqual({
      conditions: [
        { field: "value", op: "gt", value: "1000" },
        { field: "title", op: "contains", value: "acme" },
      ],
    });
  });

  it("drops rows with a blank value and returns null when nothing remains", () => {
    expect(dealRowsToDefinition([{ field: "title", op: "contains", value: "   " }])).toBeNull();
    expect(dealRowsToDefinition([])).toBeNull();
  });

  it("drops rows whose field/op pairing is not allow-listed", () => {
    // contains is not a valid op for the numeric `value` column.
    expect(dealRowsToDefinition([{ field: "value", op: "contains", value: "5" }])).toBeNull();
    // unknown field.
    expect(dealRowsToDefinition([{ field: "bogus", op: "eq", value: "x" }])).toBeNull();
  });
});
