import { describe, expect, it } from "vitest";
import { dealFilterFields } from "./dealFilterCatalog";
import { conditionRowIssue, dealRowsToDefinition, definitionToRows } from "./dealFilterRows";

describe("dealRowsToDefinition", () => {
  it("compiles non-blank rows into a deal filter definition", () => {
    const def = dealRowsToDefinition(
      [
        { field: "value", op: "gt", value: "1000" },
        { field: "title", op: "contains", value: "acme" },
      ],
      "and",
    );
    expect(def).toEqual({
      combinator: "and",
      conditions: [
        { field: "value", op: "gt", value: "1000" },
        { field: "title", op: "contains", value: "acme" },
      ],
    });
  });

  // The combinator the user picked is what the read path joins on, so it has to travel with the
  // conditions rather than being re-derived (or hardcoded to AND) further down.
  it("carries the chosen combinator into the definition", () => {
    const def = dealRowsToDefinition(
      [
        { field: "value", op: "gt", value: "1000" },
        { field: "title", op: "contains", value: "acme" },
      ],
      "or",
    );
    expect(def?.combinator).toBe("or");
  });

  it("drops rows with a blank value and returns null when nothing remains", () => {
    expect(
      dealRowsToDefinition([{ field: "title", op: "contains", value: "   " }], "and"),
    ).toBeNull();
    expect(dealRowsToDefinition([], "and")).toBeNull();
  });

  it("keeps a valueless row, whose blank value is what the operator means", () => {
    expect(dealRowsToDefinition([{ field: "orgName", op: "isEmpty", value: "" }], "and")).toEqual({
      combinator: "and",
      conditions: [{ field: "orgName", op: "isEmpty" }],
    });
  });

  it("leaves no stale value on a valueless row", () => {
    const def = dealRowsToDefinition([{ field: "title", op: "isNotEmpty", value: "acme" }], "and");
    expect(def?.conditions[0]).not.toHaveProperty("value", "acme");
  });

  // Several labels are one "is any of" condition, so the array travels whole.
  it("compiles a multi-value row into a single condition carrying every value", () => {
    expect(
      dealRowsToDefinition([{ field: "labels", op: "eq", value: ["Hot", "Cold"] }], "and"),
    ).toEqual({
      combinator: "and",
      conditions: [{ field: "labels", op: "eq", value: ["Hot", "Cold"] }],
    });
  });

  // An empty multi-select is an unfinished row. Compiling it would build a condition matching
  // nothing while the filter looked applied.
  it("drops a multi-value row with nothing picked", () => {
    expect(dealRowsToDefinition([{ field: "labels", op: "eq", value: [] }], "and")).toBeNull();
    expect(dealRowsToDefinition([{ field: "labels", op: "eq", value: ["  "] }], "and")).toBeNull();
  });

  it("drops rows whose field/op pairing is not allow-listed", () => {
    // contains is not a valid op for the numeric `value` column.
    expect(
      dealRowsToDefinition([{ field: "value", op: "contains", value: "5" }], "and"),
    ).toBeNull();
    // unknown field.
    expect(dealRowsToDefinition([{ field: "bogus", op: "eq", value: "x" }], "and")).toBeNull();
  });
});

// Reopening a saved filter has to show the conditions and the combinator that were saved, so the
// definition must map back to editable rows.
describe("definitionToRows", () => {
  it("rebuilds one row per saved condition", () => {
    const rows = definitionToRows({
      combinator: "or",
      conditions: [
        { field: "title", op: "contains", value: "acme" },
        { field: "value", op: "isEmpty" },
      ],
    });
    expect(rows.map((r) => ({ field: r.field, op: r.op, value: r.value }))).toEqual([
      { field: "title", op: "contains", value: "acme" },
      { field: "value", op: "isEmpty", value: "" },
    ]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("keeps a multi-value condition as a list, so the multi-select shows every chip", () => {
    const rows = definitionToRows({
      combinator: "and",
      conditions: [{ field: "labels", op: "eq", value: ["Hot", "Cold"] }],
    });
    expect(rows[0]?.value).toEqual(["Hot", "Cold"]);
  });
});

const FIELDS = dealFilterFields();

// Catching a malformed value as the user types keeps a doomed save off the wire, and the message
// names the field so the user knows which row to fix.
describe("conditionRowIssue", () => {
  it("passes rows whose values match the field's input kind", () => {
    expect(
      conditionRowIssue(
        [
          { field: "value", op: "gt", value: "1000" },
          { field: "expectedCloseDate", op: "gte", value: "2026-08-25" },
          { field: "title", op: "contains", value: "acme" },
        ],
        FIELDS,
      ),
    ).toBeNull();
  });

  it("ignores rows that have no value yet", () => {
    expect(conditionRowIssue([{ field: "value", op: "gt", value: "  " }], FIELDS)).toBeNull();
  });

  it("does not flag a valueless row as incomplete", () => {
    expect(conditionRowIssue([{ field: "value", op: "isEmpty", value: "" }], FIELDS)).toBeNull();
    expect(
      conditionRowIssue([{ field: "expectedCloseDate", op: "isNotEmpty", value: "x" }], FIELDS),
    ).toBeNull();
  });

  it("reports a non-numeric value on a number field", () => {
    const issue = conditionRowIssue([{ field: "value", op: "gt", value: "ten" }], FIELDS);
    expect(issue).toMatch(/Value/);
    expect(issue).toMatch(/number/i);
  });

  it("reports an unparseable date", () => {
    const issue = conditionRowIssue(
      [{ field: "expectedCloseDate", op: "gt", value: "not-a-date" }],
      FIELDS,
    );
    expect(issue).toMatch(/Expected close/);
    expect(issue).toMatch(/date/i);
  });
});
