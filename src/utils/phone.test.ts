import { describe, expect, it } from "vitest";
import { formatUsPhone } from "./phone";

describe("formatUsPhone", () => {
  it("formats a bare 10-digit number", () => {
    expect(formatUsPhone("4155551234")).toBe("(415) 555-1234");
  });

  it("strips a leading US country code (11 digits starting with 1)", () => {
    expect(formatUsPhone("14155551234")).toBe("(415) 555-1234");
  });

  it("normalizes a number that already has separators", () => {
    expect(formatUsPhone("415.555.1234")).toBe("(415) 555-1234");
    expect(formatUsPhone("(415) 555-1234")).toBe("(415) 555-1234");
  });

  it("leaves a non-US-looking number untouched", () => {
    expect(formatUsPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });

  it("leaves a too-short number untouched", () => {
    expect(formatUsPhone("12345")).toBe("12345");
  });

  it("leaves a number with an extension untouched (ambiguous digit count)", () => {
    expect(formatUsPhone("(415) 555-1234 x99")).toBe("(415) 555-1234 x99");
  });

  it("returns an empty string unchanged", () => {
    expect(formatUsPhone("")).toBe("");
  });
});
