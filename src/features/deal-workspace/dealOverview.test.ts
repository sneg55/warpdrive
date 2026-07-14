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

  // Regression: age is a calendar-day difference, not whole elapsed 24h periods. A deal created
  // 7/10 in the afternoon and viewed 7/12 in the morning is 2 calendar days old, even though only
  // ~1.75 * 24h have elapsed. Flooring the raw ms delta reported "1" here. Uses local Date parts to
  // match the client-side `now` and the "Created" line's toLocaleDateString().
  it("counts calendar days, not whole 24h periods", () => {
    const created = new Date(2026, 6, 10, 15, 0, 0); // Jul 10, 15:00 local
    const viewed = new Date(2026, 6, 12, 9, 0, 0); // Jul 12, 09:00 local
    expect(dealOverview(created, null, viewed).ageDays).toBe(2);
  });

  it("inactiveDays also counts calendar days", () => {
    const created = new Date(2026, 6, 1, 12, 0, 0);
    const lastActivity = new Date(2026, 6, 10, 20, 0, 0); // Jul 10 evening
    const viewed = new Date(2026, 6, 12, 8, 0, 0); // Jul 12 morning
    expect(dealOverview(created, lastActivity, viewed).inactiveDays).toBe(2);
  });
});
