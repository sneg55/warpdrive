import { describe, expect, it } from "vitest";
import { upgradeMappedRow } from "./import";

describe("upgradeMappedRow", () => {
  it("passes a grouped row through untouched", () => {
    const grouped = {
      primary: { title: "A lead" },
      organization: { name: "NJT", domain: "njtransit.com" },
      note: { body: "posture: fails" },
    };
    expect(upgradeMappedRow(grouped)).toBe(grouped);
  });

  // Rows validated before cross-entity mapping are stored flat and are already "valid", so nothing
  // revalidates them. Commit must read them as they are.
  it("wraps a legacy flat row as the primary record", () => {
    expect(upgradeMappedRow({ name: "Legacy Person", customFields: {} })).toEqual({
      primary: { name: "Legacy Person", customFields: {} },
    });
  });

  it("lifts a legacy lead's flat orgName into the organization group", () => {
    expect(upgradeMappedRow({ title: "Legacy lead", orgName: "Legacy Transit" })).toEqual({
      primary: { title: "Legacy lead" },
      organization: { name: "Legacy Transit" },
    });
  });

  it("ignores a blank legacy orgName rather than creating a nameless org", () => {
    expect(upgradeMappedRow({ title: "Solo", orgName: "   " })).toEqual({
      primary: { title: "Solo" },
    });
    expect(upgradeMappedRow({ title: "Solo" })).toEqual({ primary: { title: "Solo" } });
  });

  it("treats a null mapped column as an empty primary", () => {
    expect(upgradeMappedRow(null)).toEqual({ primary: {} });
  });

  // A legacy row could legitimately have a column literally named "primary" only if it were a
  // grouped row; guard the type check so a stray scalar does not masquerade as one.
  it("does not mistake a scalar 'primary' cell for a grouped row", () => {
    expect(upgradeMappedRow({ primary: "yes", name: "X" })).toEqual({
      primary: { primary: "yes", name: "X" },
    });
  });
});
