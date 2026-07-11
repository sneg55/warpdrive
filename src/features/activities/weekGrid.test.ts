import { describe, expect, it } from "vitest";
import type { CalendarActivity } from "./calendar";
import { groupByDay, overdueItems, weekDays } from "./weekGrid";

describe("week grid", () => {
  it("returns Monday-first seven days for a mid-week date", () => {
    const days = weekDays(new Date("2026-07-02T12:00:00Z")); // Thursday
    expect(days).toHaveLength(7);
    const first = days[0];
    const last = days[6];
    if (first === undefined || last === undefined) throw new Error("weekDays must return 7 days");
    expect(first.getUTCDay()).toBe(1); // Monday
    expect(last.getUTCDay()).toBe(0); // Sunday
  });

  it("buckets a multi-day activity into every day its start->end span covers", () => {
    const acts: CalendarActivity[] = [
      {
        id: "m",
        subject: "Conference",
        dueAt: new Date("2026-06-30T09:00:00Z"), // Tuesday, before the week
        endAt: new Date("2026-07-02T17:00:00Z"), // Thursday, inside the week
        durationMinutes: null,
        typeKey: "meeting",
        done: false,
        dealId: null,
        personId: null,
        orgId: null,
        overdue: false,
        ownerName: null,
      },
    ];
    const days = weekDays(new Date("2026-07-02T12:00:00Z")); // Mon Jun 29 .. Sun Jul 5
    const grouped = groupByDay(acts, days);
    // The span covers Jun 30, Jul 1, Jul 2; only Jun 30..Jul 2 are in this week's Mon-first range.
    expect(grouped.get("2026-06-30")?.map((a) => a.id)).toEqual(["m"]);
    expect(grouped.get("2026-07-01")?.map((a) => a.id)).toEqual(["m"]);
    expect(grouped.get("2026-07-02")?.map((a) => a.id)).toEqual(["m"]);
    // Days outside the span do not get it.
    expect(grouped.get("2026-07-03") ?? []).toEqual([]);
  });

  it("groups activities into their day bucket and collects overdue items", () => {
    const acts: CalendarActivity[] = [
      {
        id: "1",
        subject: "A",
        dueAt: new Date("2026-07-02T10:00:00Z"),
        durationMinutes: 30,
        typeKey: "call",
        done: false,
        dealId: null,
        personId: null,
        orgId: null,
        overdue: false,
        ownerName: null,
      },
      {
        id: "2",
        subject: "B",
        dueAt: new Date("2026-06-20T10:00:00Z"),
        durationMinutes: null,
        typeKey: "task",
        done: false,
        dealId: null,
        personId: null,
        orgId: null,
        overdue: true,
        ownerName: null,
      },
    ];
    const days = weekDays(new Date("2026-07-02T12:00:00Z"));
    const grouped = groupByDay(acts, days);
    expect(grouped.get("2026-07-02")?.map((a) => a.id)).toEqual(["1"]);
    expect(overdueItems(acts).map((a) => a.id)).toEqual(["2"]);
  });

  it("includeOverdue=true keeps overdue activities in their due-day bucket", () => {
    // Navigating to a past week makes every incomplete activity overdue; the grid must still
    // place them on their day (they render red in-cell) instead of vanishing from the week.
    const od: CalendarActivity = {
      id: "od",
      subject: "Past due",
      dueAt: new Date("2026-07-02T10:00:00Z"),
      durationMinutes: null,
      typeKey: "task",
      done: false,
      dealId: null,
      personId: null,
      orgId: null,
      overdue: true,
      ownerName: null,
    };
    const days = weekDays(new Date("2026-07-02T12:00:00Z"));
    expect(
      groupByDay([od], days)
        .get("2026-07-02")
        ?.map((a) => a.id),
    ).toEqual([]);
    expect(
      groupByDay([od], days, true)
        .get("2026-07-02")
        ?.map((a) => a.id),
    ).toEqual(["od"]);
  });
});
