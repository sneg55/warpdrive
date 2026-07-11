import { describe, expect, it } from "vitest";
import { availabilityWindow } from "./composerHelpers";

describe("availabilityWindow", () => {
  it("covers the full same-day window through the end time (not just the start instant)", () => {
    // Same-day 10:00 to 11:00: the busy check must span to 11:00, else a 10:30 conflict reads Free.
    const w = availabilityWindow("2026-07-02", "10:00", "", "11:00");
    expect(w.from).toBe(new Date("2026-07-02T10:00").toISOString());
    expect(w.to).toBe(new Date("2026-07-02T11:00").toISOString());
    expect(w.to).not.toBe(w.from);
  });

  it("uses the end date + end time for a multi-day window", () => {
    const w = availabilityWindow("2026-07-01", "09:00", "2026-07-03", "17:00");
    expect(w.from).toBe(new Date("2026-07-01T09:00").toISOString());
    expect(w.to).toBe(new Date("2026-07-03T17:00").toISOString());
  });

  it("falls back to the start instant when no end time or date is given", () => {
    const w = availabilityWindow("2026-07-02", "10:00", "", "");
    expect(w.to).toBe(w.from);
  });
});
