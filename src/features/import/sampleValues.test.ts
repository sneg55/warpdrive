import { describe, expect, it } from "vitest";
import { MAP_SAMPLE_VALUE_COUNT, sampleValues } from "./sampleValues";

describe("sampleValues", () => {
  const rows = [
    { agency_name: "New Jersey Transit Corporation", state: "NJ", has_rt: "False" },
    { agency_name: "Chicago Transit Authority", state: "IL", has_rt: "False" },
    { agency_name: "Bay Area Rapid Transit", state: "CA", has_rt: "True" },
  ];

  it("takes the first two values in row order, matching Pipedrive's map step", () => {
    expect(sampleValues(rows, "agency_name")).toEqual([
      "New Jersey Transit Corporation",
      "Chicago Transit Authority",
    ]);
  });

  it("caps at MAP_SAMPLE_VALUE_COUNT even when more rows exist", () => {
    expect(MAP_SAMPLE_VALUE_COUNT).toBe(2);
    expect(sampleValues(rows, "state")).toHaveLength(MAP_SAMPLE_VALUE_COUNT);
  });

  // PD shows repeated values verbatim rather than collapsing them (see has_rt: False / False in
  // docs/parity-captures/leads-import-pd/08-map-step.png). Deduping would misrepresent the data.
  it("keeps duplicate values instead of deduping them", () => {
    expect(sampleValues(rows, "has_rt")).toEqual(["False", "False"]);
  });

  // Blank cells would render as empty lines under the column name, so skip past them to the next
  // row that actually has a value.
  it("skips blank and whitespace-only values", () => {
    const sparse = [{ city: "" }, { city: "   " }, { city: "Newark" }, { city: "Chicago" }];
    expect(sampleValues(sparse, "city")).toEqual(["Newark", "Chicago"]);
  });

  it("trims surrounding whitespace", () => {
    expect(sampleValues([{ city: "  Newark  " }], "city")).toEqual(["Newark"]);
  });

  it("ignores rows missing the column entirely", () => {
    expect(sampleValues([{ other: "x" }, { city: "Newark" }], "city")).toEqual(["Newark"]);
  });

  it("returns nothing when there are no rows", () => {
    expect(sampleValues([], "city")).toEqual([]);
  });
});
