import { describe, expect, it } from "vitest";
import { ORG_FILTER_CONFIG, PERSON_FILTER_CONFIG } from "./contactFilter";
import {
  type BuilderRow,
  fieldKind,
  OP_LABELS,
  ORG_FILTER_LABELS,
  PERSON_FILTER_LABELS,
  rowsToDefinition,
} from "./contactFilterRows";

describe("labels field metadata", () => {
  it("labels the field for both entities", () => {
    expect(PERSON_FILTER_LABELS.labels).toBe("Label");
    expect(ORG_FILTER_LABELS.labels).toBe("Label");
  });

  // A dedicated kind so the builder renders a label picker instead of a free-text box: a raw
  // typed string would have to match a label key exactly to ever match a row.
  it("reports the label kind so the value control is a picker, not a text box", () => {
    expect(fieldKind(PERSON_FILTER_CONFIG, "labels")).toBe("label");
    expect(fieldKind(ORG_FILTER_CONFIG, "labels")).toBe("label");
    expect(fieldKind(ORG_FILTER_CONFIG, "employeeCount")).toBe("number");
    expect(fieldKind(PERSON_FILTER_CONFIG, "ownerId")).toBe("owner");
  });
});

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

  // A label key is a string, so it must survive as one: numeric coercion would send NaN to SQL.
  it("keeps a labels row's value as a string", () => {
    expect(
      rowsToDefinition(
        "and",
        rows([{ field: "labels", op: "eq", value: " hot " }]),
        PERSON_FILTER_CONFIG,
      ),
    ).toEqual({ combinator: "and", conditions: [{ field: "labels", op: "eq", value: "hot" }] });
  });

  // Several labels are one "is any of" condition, so the array travels whole.
  it("keeps every value of a multi-value labels row", () => {
    expect(
      rowsToDefinition(
        "or",
        rows([{ field: "labels", op: "eq", value: ["hot", " cold "] }]),
        PERSON_FILTER_CONFIG,
      ),
    ).toEqual({
      combinator: "or",
      conditions: [{ field: "labels", op: "eq", value: ["hot", "cold"] }],
    });
  });

  // An empty multi-select is an unfinished row: compiling it would match nothing while the filter
  // looked applied.
  it("drops a multi-value row with nothing picked", () => {
    expect(
      rowsToDefinition(
        "and",
        rows([{ field: "labels", op: "eq", value: [] }]),
        PERSON_FILTER_CONFIG,
      ),
    ).toBeNull();
  });

  it("exposes human labels for every operator", () => {
    expect(OP_LABELS.contains).toBe("contains");
    expect(OP_LABELS.eq).toBeDefined();
    expect(OP_LABELS.startsWith).toBe("starts with");
    expect(OP_LABELS.notContains).toBe("does not contain");
    expect(OP_LABELS.isEmpty).toBe("is empty");
    expect(OP_LABELS.isNotEmpty).toBe("is not empty");
  });

  // isEmpty takes no value, so the builder leaves the value box blank. Dropping the row would make
  // an "is empty" filter look exactly like a filter that matched everything.
  it("keeps a valueless row whose value is blank", () => {
    expect(
      rowsToDefinition(
        "and",
        rows([{ field: "primaryEmail", op: "isEmpty", value: "" }]),
        PERSON_FILTER_CONFIG,
      ),
    ).toEqual({
      combinator: "and",
      conditions: [{ field: "primaryEmail", op: "isEmpty" }],
    });
  });

  it("keeps a valueless row on a numeric field without coercing a blank to NaN", () => {
    expect(
      rowsToDefinition(
        "and",
        rows([{ field: "employeeCount", op: "isNotEmpty", value: "" }]),
        ORG_FILTER_CONFIG,
      ),
    ).toEqual({
      combinator: "and",
      conditions: [{ field: "employeeCount", op: "isNotEmpty" }],
    });
  });

  it("keeps a valueless row alongside a value-taking one and still drops the blank one", () => {
    expect(
      rowsToDefinition(
        "and",
        rows([
          { field: "name", op: "contains", value: "acme" },
          { field: "primaryEmail", op: "isEmpty", value: "" },
          { field: "name", op: "contains", value: "  " },
        ]),
        PERSON_FILTER_CONFIG,
      ),
    ).toEqual({
      combinator: "and",
      conditions: [
        { field: "name", op: "contains", value: "acme" },
        { field: "primaryEmail", op: "isEmpty" },
      ],
    });
  });

  it("drops a valueless op the field does not allow (ownerId takes eq/neq only)", () => {
    expect(
      rowsToDefinition(
        "and",
        rows([{ field: "ownerId", op: "isEmpty", value: "" }]),
        PERSON_FILTER_CONFIG,
      ),
    ).toBeNull();
  });
});
