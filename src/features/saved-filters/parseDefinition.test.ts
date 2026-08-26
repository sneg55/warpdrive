import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { filterToSql } from "./filterAst";
import { parseSavedFilterDefinition, parseSavedFilterDefinitionFor } from "./parseDefinition";

// Saved filters store their definition as jsonb. This parse used to run client-side in
// savedFilterView (dragging zod into the board bundle); it now runs at the server tRPC boundary.
// These cases pin the behavior the client relied on: a valid definition passes through; anything
// malformed collapses to an empty (no-op) filter rather than throwing.
describe("parseSavedFilterDefinition", () => {
  it("passes a valid definition through", () => {
    const def = {
      conditions: [{ field: "value", op: "gt", value: 100 }],
      rotting: true,
    };
    const parsed = parseSavedFilterDefinition(def);
    expect(parsed.conditions).toEqual([{ field: "value", op: "gt", value: 100 }]);
    expect(parsed.rotting).toBe(true);
  });

  it("defaults conditions to an empty array when omitted", () => {
    expect(parseSavedFilterDefinition({}).conditions).toEqual([]);
  });

  // Saved rows predate the combinator, so a stored definition without the key has to keep meaning
  // AND, both after parsing and once compiled.
  it("defaults a stored definition with no combinator key to and", () => {
    const parsed = parseSavedFilterDefinition({
      conditions: [
        { field: "title", op: "contains", value: "acme" },
        { field: "value", op: "gt", value: 100 },
      ],
    });
    expect(parsed.combinator).toBe("and");
    expect(new PgDialect().sqlToQuery(filterToSql(parsed)).sql).toBe(
      `(d.title ILIKE '%' || $1 || '%' AND d.value > $2)`,
    );
  });

  it("falls back to an empty filter for a malformed definition", () => {
    expect(parseSavedFilterDefinition({ conditions: "nope" }).conditions).toEqual([]);
    expect(parseSavedFilterDefinition(null).conditions).toEqual([]);
    expect(parseSavedFilterDefinition(42).conditions).toEqual([]);
  });
});

// A saved view belongs to one entity, so a stored row is parsed against that entity's field
// allow-list. Parsing a person row with the deal schema would drop every person-only field.
describe("parseSavedFilterDefinitionFor", () => {
  it("parses a person definition against the person fields", () => {
    const parsed = parseSavedFilterDefinitionFor("person", {
      conditions: [{ field: "primaryEmail", op: "contains", value: "acme" }],
    });
    expect(parsed.conditions).toEqual([{ field: "primaryEmail", op: "contains", value: "acme" }]);
    expect(parsed.combinator).toBe("and");
  });

  it("keeps each entity's own fields", () => {
    expect(
      parseSavedFilterDefinitionFor("organization", {
        conditions: [{ field: "industry", op: "eq", value: "SaaS" }],
      }).conditions,
    ).toHaveLength(1);
    expect(
      parseSavedFilterDefinitionFor("lead", {
        combinator: "or",
        conditions: [{ field: "sourceOrigin", op: "eq", value: "web" }],
      }).combinator,
    ).toBe("or");
  });

  it("collapses a definition carrying another entity's field to an empty filter", () => {
    expect(
      parseSavedFilterDefinitionFor("person", {
        conditions: [{ field: "stageId", op: "eq", value: "s1" }],
      }).conditions,
    ).toEqual([]);
  });

  it("collapses a malformed definition rather than throwing", () => {
    expect(parseSavedFilterDefinitionFor("lead", null).conditions).toEqual([]);
    expect(parseSavedFilterDefinitionFor("deal", 42).conditions).toEqual([]);
  });
});
