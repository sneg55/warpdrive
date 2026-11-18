import { describe, expect, it } from "vitest";
import { columnMappingSchema, mappingEntityErrors, normalizeMapping } from "./schemas";

describe("columnMappingSchema", () => {
  it("accepts a mapping whose columns carry an entity", () => {
    const parsed = columnMappingSchema.parse({
      dedupMode: "skip",
      columns: { url: { entity: "organization", field: "domain", isCustom: false, key: "" } },
    });
    expect(parsed.columns.url?.entity).toBe("organization");
  });

  it("defaults rowNoteFromUnmapped to false", () => {
    const parsed = columnMappingSchema.parse({ dedupMode: "skip", columns: {} });
    expect(parsed.options.rowNoteFromUnmapped).toBe(false);
  });

  it("carries rowNoteFromUnmapped when set", () => {
    const parsed = columnMappingSchema.parse({
      dedupMode: "skip",
      columns: {},
      options: { rowNoteFromUnmapped: true },
    });
    expect(parsed.options.rowNoteFromUnmapped).toBe(true);
  });
});

describe("normalizeMapping (legacy batches)", () => {
  it("defaults a missing entity to the batch's target", () => {
    const m = normalizeMapping(
      { dedupMode: "skip", columns: { Name: { field: "name", isCustom: false, key: "" } } },
      "organization",
    );
    expect(m.columns.Name).toEqual({
      entity: "organization",
      field: "name",
      isCustom: false,
      key: "",
    });
  });

  it("rewrites the legacy lead orgName field to organization.name", () => {
    const m = normalizeMapping(
      {
        dedupMode: "skip",
        columns: { agency: { field: "orgName", isCustom: false, key: "" } },
      },
      "lead",
    );
    expect(m.columns.agency).toEqual({
      entity: "organization",
      field: "name",
      isCustom: false,
      key: "",
    });
  });

  it("leaves an explicit entity alone", () => {
    const m = normalizeMapping(
      {
        dedupMode: "skip",
        columns: { url: { entity: "organization", field: "domain", isCustom: false, key: "" } },
      },
      "lead",
    );
    expect(m.columns.url?.entity).toBe("organization");
  });

  it("assigns custom-field columns to the primary entity", () => {
    const m = normalizeMapping(
      { dedupMode: "skip", columns: { Seniority: { field: "", isCustom: true, key: "sen" } } },
      "person",
    );
    expect(m.columns.Seniority?.entity).toBe("person");
  });
});

describe("mappingEntityErrors", () => {
  it("accepts entities the target's groups allow", () => {
    const errs = mappingEntityErrors(
      {
        dedupMode: "skip",
        columns: {
          title: { entity: "lead", field: "title", isCustom: false, key: "" },
          agency: { entity: "organization", field: "name", isCustom: false, key: "" },
          notes: { entity: "note", field: "body", isCustom: false, key: "" },
        },
      },
      "lead",
    );
    expect(errs).toEqual([]);
  });

  it("accepts a person group on a lead import", () => {
    const errs = mappingEntityErrors(
      {
        dedupMode: "skip",
        columns: { who: { entity: "person", field: "name", isCustom: false, key: "" } },
      },
      "lead",
    );
    expect(errs).toEqual([]);
  });

  it("rejects a note group on an activity import", () => {
    const errs = mappingEntityErrors(
      {
        dedupMode: "skip",
        columns: { n: { entity: "note", field: "body", isCustom: false, key: "" } },
      },
      "activity",
    );
    expect(errs).toHaveLength(1);
  });

  it("accepts a legacy mapping with no entity at all", () => {
    const errs = mappingEntityErrors(
      { dedupMode: "skip", columns: { Name: { field: "name", isCustom: false, key: "" } } },
      "organization",
    );
    expect(errs).toEqual([]);
  });
});
