import { describe, expect, it } from "vitest";
import { isoToDayHeading } from "./dayHeading";

describe("isoToDayHeading", () => {
  it("formats an ISO date as weekday + day-of-month", () => {
    // 2026-06-28 is a Sunday, 2026-06-29 a Monday (matches the seeded week).
    expect(isoToDayHeading("2026-06-28")).toBe("Sun 28");
    expect(isoToDayHeading("2026-06-29")).toBe("Mon 29");
  });

  it("is timezone-independent (parses the date parts directly)", () => {
    expect(isoToDayHeading("2026-07-04")).toBe("Sat 4");
  });
});
