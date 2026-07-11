import { describe, expect, it } from "vitest";
import { entityTitle } from "./pageTitle";

describe("entityTitle", () => {
  it("uses the entity's own name when present", () => {
    expect(entityTitle("Acme Corp", "Organization")).toBe("Acme Corp");
  });

  it("trims surrounding whitespace", () => {
    expect(entityTitle("  Big Deal  ", "Deal")).toBe("Big Deal");
  });

  it("falls back when the name is null", () => {
    expect(entityTitle(null, "Deal")).toBe("Deal");
  });

  it("falls back when the name is undefined", () => {
    expect(entityTitle(undefined, "Person")).toBe("Person");
  });

  it("falls back when the name is empty or whitespace only", () => {
    expect(entityTitle("", "Person")).toBe("Person");
    expect(entityTitle("   ", "Person")).toBe("Person");
  });
});
