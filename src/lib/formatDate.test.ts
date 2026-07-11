import { describe, expect, it } from "vitest";
import { formatMediumDate } from "./formatDate";

describe("formatMediumDate", () => {
  it("formats a YYYY-MM-DD date as 'Mon D, YYYY'", () => {
    expect(formatMediumDate("2026-07-16")).toBe("Jul 16, 2026");
  });

  it("returns the raw string when it is not a parseable date", () => {
    expect(formatMediumDate("not-a-date")).toBe("not-a-date");
  });
});
