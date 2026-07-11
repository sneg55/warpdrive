import { describe, expect, it } from "vitest";
import { joinName, splitName } from "./personName";

describe("splitName", () => {
  it("splits first token as firstName and the remainder as lastName", () => {
    expect(splitName("Mia Silva")).toEqual({ firstName: "Mia", lastName: "Silva" });
  });
  it("keeps multi-word remainder in lastName", () => {
    expect(splitName("Ana Maria De La Cruz")).toEqual({
      firstName: "Ana",
      lastName: "Maria De La Cruz",
    });
  });
  it("returns null lastName for a single token", () => {
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: null });
  });
  it("collapses surrounding/inner whitespace", () => {
    expect(splitName("  Mia   Silva  ")).toEqual({ firstName: "Mia", lastName: "Silva" });
  });
  it("handles empty string", () => {
    expect(splitName("")).toEqual({ firstName: "", lastName: null });
  });
});

describe("joinName", () => {
  it("joins first and last", () => {
    expect(joinName({ firstName: "Mia", lastName: "Silva" })).toBe("Mia Silva");
  });
  it("omits a null/empty last name", () => {
    expect(joinName({ firstName: "Cher", lastName: null })).toBe("Cher");
    expect(joinName({ firstName: "Cher", lastName: "" })).toBe("Cher");
  });
  it("trims", () => {
    expect(joinName({ firstName: "  Mia ", lastName: " Silva " })).toBe("Mia Silva");
  });
});
