import { describe, expect, it } from "vitest";
import { dealOverview } from "./dealOverview";

const now = new Date("2026-07-01T12:00:00Z");

describe("dealOverview", () => {
  it("computes age from createdAt", () => {
    expect(dealOverview(new Date("2026-06-21T12:00:00Z"), null, now).ageDays).toBe(10);
  });

  it("inactiveDays uses the last activity when present", () => {
    const r = dealOverview(new Date("2026-06-01T12:00:00Z"), new Date("2026-06-28T12:00:00Z"), now);
    expect(r.inactiveDays).toBe(3);
  });

  it("inactiveDays falls back to age when never active", () => {
    const r = dealOverview(new Date("2026-06-25T12:00:00Z"), null, now);
    expect(r.inactiveDays).toBe(6);
    expect(r.ageDays).toBe(6);
  });

  it("never returns negative values for a future createdAt", () => {
    const r = dealOverview(new Date("2026-07-05T12:00:00Z"), null, now);
    expect(r.ageDays).toBe(0);
    expect(r.inactiveDays).toBe(0);
  });
});
