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

  it("counts calendar days, not whole 24h periods", () => {
    const created = new Date(2026, 6, 10, 15, 0, 0);
    const viewed = new Date(2026, 6, 12, 9, 0, 0);
    expect(dealOverview(created, null, viewed).ageDays).toBe(2);
  });

  it("inactiveDays also counts calendar days", () => {
    const created = new Date(2026, 6, 1, 12, 0, 0);
    const lastActivity = new Date(2026, 6, 10, 20, 0, 0);
    const viewed = new Date(2026, 6, 12, 8, 0, 0);
    expect(dealOverview(created, lastActivity, viewed).inactiveDays).toBe(2);
  });
});
