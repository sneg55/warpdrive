import { describe, expect, it } from "vitest";
import { leadRowsToCondition } from "./leadFilterRows";

describe("leadRowsToCondition", () => {
  it("compiles non-blank rows into a lead condition definition", () => {
    expect(
      leadRowsToCondition(
        [
          { field: "title", op: "contains", value: "acme" },
          { field: "value", op: "gt", value: "1000" },
        ],
        "and",
      ),
    ).toEqual({
      combinator: "and",
      conditions: [
        { field: "title", op: "contains", value: "acme" },
        { field: "value", op: "gt", value: "1000" },
      ],
    });
  });

  it("drops blank rows and returns null when nothing remains", () => {
    expect(leadRowsToCondition([{ field: "title", op: "contains", value: " " }], "and")).toBeNull();
    expect(leadRowsToCondition([], "or")).toBeNull();
  });

  it("drops rows whose field/op pairing is not allow-listed", () => {
    expect(leadRowsToCondition([{ field: "value", op: "contains", value: "5" }], "and")).toBeNull();
    expect(leadRowsToCondition([{ field: "bogus", op: "eq", value: "x" }], "and")).toBeNull();
  });
});
