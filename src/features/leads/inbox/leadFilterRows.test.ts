import { describe, expect, it } from "vitest";
import { leadConditionInput } from "../schemas";
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

  // A label key is a string; the row must survive compilation with its value untouched.
  it("keeps a labels row and its string value", () => {
    expect(leadRowsToCondition([{ field: "labels", op: "eq", value: " hot " }], "and")).toEqual({
      combinator: "and",
      conditions: [{ field: "labels", op: "eq", value: "hot" }],
    });
  });

  // Several labels are one "is any of" condition, so the array travels whole.
  it("keeps every value of a multi-value labels row", () => {
    expect(
      leadRowsToCondition([{ field: "labels", op: "eq", value: ["hot", " cold "] }], "or"),
    ).toEqual({
      combinator: "or",
      conditions: [{ field: "labels", op: "eq", value: ["hot", "cold"] }],
    });
  });

  // An empty multi-select is an unfinished row: compiling it would match nothing while the filter
  // looked applied.
  it("drops a multi-value row with nothing picked", () => {
    expect(leadRowsToCondition([{ field: "labels", op: "eq", value: [] }], "and")).toBeNull();
  });

  it("drops blank rows and returns null when nothing remains", () => {
    expect(leadRowsToCondition([{ field: "title", op: "contains", value: " " }], "and")).toBeNull();
    expect(leadRowsToCondition([], "or")).toBeNull();
  });

  it("drops rows whose field/op pairing is not allow-listed", () => {
    expect(leadRowsToCondition([{ field: "value", op: "contains", value: "5" }], "and")).toBeNull();
    expect(leadRowsToCondition([{ field: "bogus", op: "eq", value: "x" }], "and")).toBeNull();
  });

  // isEmpty takes no value, so the builder leaves the value box blank. Dropping the row would make
  // an "is empty" filter look exactly like a filter that matched everything. The key is omitted
  // rather than sent as "", so the client posts the shape leadConditionInput actually describes.
  it("keeps a valueless row and emits it without a value key", () => {
    expect(leadRowsToCondition([{ field: "title", op: "isEmpty", value: "" }], "and")).toEqual({
      combinator: "and",
      conditions: [{ field: "title", op: "isEmpty" }],
    });
  });

  it("keeps a valueless row alongside a value-taking one and still drops the blank one", () => {
    expect(
      leadRowsToCondition(
        [
          { field: "title", op: "contains", value: "acme" },
          { field: "value", op: "isNotEmpty", value: "" },
          { field: "sourceOrigin", op: "contains", value: "  " },
        ],
        "and",
      ),
    ).toEqual({
      combinator: "and",
      conditions: [
        { field: "title", op: "contains", value: "acme" },
        { field: "value", op: "isNotEmpty" },
      ],
    });
  });

  // The builder's output goes straight to lead.list, so it has to satisfy that boundary schema.
  it("emits a valueless row the lead.list boundary schema accepts", () => {
    const condition = leadRowsToCondition([{ field: "value", op: "isEmpty", value: "" }], "and");
    expect(leadConditionInput.safeParse(condition).success).toBe(true);
  });

  it("drops a valueless op the field does not allow (ownerId takes eq/neq only)", () => {
    expect(leadRowsToCondition([{ field: "ownerId", op: "isEmpty", value: "" }], "and")).toBeNull();
  });
});
