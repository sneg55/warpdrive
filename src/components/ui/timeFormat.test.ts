import { describe, expect, it } from "vitest";
import { isValidHm, maskTime } from "./timeFormat";

describe("timeFormat", () => {
  it("keeps a valid HH:mm", () => {
    expect(maskTime("14:00")).toBe("14:00");
    expect(maskTime("09:30")).toBe("09:30");
  });
  it("pads a bare hour and inserts the colon", () => {
    expect(maskTime("9")).toBe("09:00");
    expect(maskTime("930")).toBe("09:30");
    expect(maskTime("1345")).toBe("13:45");
  });
  it("blanks unparseable or out-of-range input", () => {
    expect(maskTime("")).toBe("");
    expect(maskTime("99:99")).toBe("");
    expect(maskTime("abc")).toBe("");
  });
  it("isValidHm gates the range", () => {
    expect(isValidHm("23:59")).toBe(true);
    expect(isValidHm("24:00")).toBe(false);
    expect(isValidHm("")).toBe(false);
  });

  it("hits the exact lower and upper HH:mm boundary", () => {
    expect(maskTime("0")).toBe("00:00");
    expect(maskTime("2359")).toBe("23:59");
    expect(isValidHm("00:00")).toBe(true);
  });

  it("tolerates a partial colon while typing (e.g. one-digit hour + colon)", () => {
    expect(maskTime("9:30")).toBe("09:30");
  });

  it("trims surrounding whitespace before masking", () => {
    expect(maskTime("  9:30  ")).toBe("09:30");
  });

  it("blanks a digit string whose minute component overflows 59", () => {
    expect(maskTime("1260")).toBe("");
  });

  it("blanks an out-of-range hour built from 4 digits", () => {
    expect(maskTime("2400")).toBe("");
  });

  it("respects the typed colon position instead of re-deriving from digit count", () => {
    expect(maskTime("13:5")).toBe("13:05");
    expect(maskTime("1:5")).toBe("01:05");
    expect(maskTime("2:3")).toBe("02:03");
    expect(maskTime("20:5")).toBe("20:05");
    expect(maskTime("22:5")).toBe("22:05");
    expect(maskTime("12:3")).toBe("12:03");
  });

  it("keeps two-digit minutes on either side of the colon", () => {
    expect(maskTime("13:59")).toBe("13:59");
    expect(maskTime("9:05")).toBe("09:05");
  });

  it("blanks an out-of-range hour or minute typed with a colon", () => {
    expect(maskTime("25:00")).toBe("");
    expect(maskTime("13:99")).toBe("");
  });
});
