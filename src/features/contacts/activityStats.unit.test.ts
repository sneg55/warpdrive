import { describe, expect, it } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { computeActivityStats } from "./activityStats";

function activity(overrides: Partial<CalendarActivity>): CalendarActivity {
  return {
    id: "a",
    subject: "s",
    dueAt: new Date("2026-07-02T10:00:00Z"),
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: "pe1",
    orgId: null,
    overdue: false,
    ownerName: "Nick",
    note: null,
    location: null,
    ...overrides,
  };
}

describe("computeActivityStats", () => {
  it("counts totals, done/open, per-type, and derives last-activity + inactive days", () => {
    const now = new Date("2026-07-09T10:00:00Z");
    const stats = computeActivityStats(
      [
        activity({
          id: "a1",
          typeKey: "call",
          done: true,
          dueAt: new Date("2026-07-02T10:00:00Z"),
        }),
        activity({
          id: "a2",
          typeKey: "meeting",
          done: false,
          dueAt: new Date("2026-07-05T10:00:00Z"),
        }),
        activity({
          id: "a3",
          typeKey: "call",
          done: true,
          dueAt: new Date("2026-07-01T10:00:00Z"),
        }),
      ],
      now,
    );

    expect(stats.total).toBe(3);
    expect(stats.done).toBe(2);
    expect(stats.open).toBe(1);
    expect(stats.byType).toEqual({ call: 2, meeting: 1 });
    // Last activity = the most recent DONE activity (2026-07-02), not the open future one.
    expect(stats.lastActivityAt).toEqual(new Date("2026-07-02T10:00:00Z"));
    // Inactive days = whole days between that and now (2026-07-09 minus 2026-07-02 = 7).
    expect(stats.inactiveDays).toBe(7);
  });

  it("returns null last-activity and inactive days when there is no completed activity", () => {
    const now = new Date("2026-07-09T10:00:00Z");
    const stats = computeActivityStats([activity({ id: "a1", done: false })], now);
    expect(stats.total).toBe(1);
    expect(stats.done).toBe(0);
    expect(stats.lastActivityAt).toBeNull();
    expect(stats.inactiveDays).toBeNull();
  });

  it("ranks most-active users by activity count, descending (spec B2 Overview)", () => {
    const now = new Date("2026-07-09T10:00:00Z");
    const stats = computeActivityStats(
      [
        activity({ id: "a1", ownerName: "Ann" }),
        activity({ id: "a2", ownerName: "Ann" }),
        activity({ id: "a3", ownerName: "Bob" }),
        activity({ id: "a4", ownerName: null }), // unowned activities are excluded
      ],
      now,
    );
    expect(stats.mostActiveUsers).toEqual([
      { name: "Ann", count: 2 },
      { name: "Bob", count: 1 },
    ]);
  });
});
