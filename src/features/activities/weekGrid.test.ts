import { describe, expect, it } from "vitest";
import type { CalendarActivity } from "./calendar";
import { groupByDay, weekDays } from "./weekGrid";

describe("week grid", () => {
  it("returns Monday-first seven days for a mid-week date", () => {
    const days = weekDays(new Date("2026-07-02T12:00:00Z"));
    expect(days).toHaveLength(7);
    const first = days[0];
    const last = days[6];
    if (first === undefined || last === undefined) throw new Error("weekDays must return 7 days");
    expect(first.getUTCDay()).toBe(1);
    expect(last.getUTCDay()).toBe(0);
  });

  it("buckets a multi-day activity into every day its start->end span covers", () => {
    const acts: CalendarActivity[] = [
      {
        id: "m",
        subject: "Conference",
        dueAt: new Date("2026-06-30T09:00:00Z"),
        allDay: false,
        endAt: new Date("2026-07-02T17:00:00Z"),
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
    const days = weekDays(new Date("2026-07-02T12:00:00Z"));
    const grouped = groupByDay(acts, days);
    expect(grouped.get("2026-06-30")?.map((a) => a.id)).toEqual(["m"]);
    expect(grouped.get("2026-07-01")?.map((a) => a.id)).toEqual(["m"]);
    expect(grouped.get("2026-07-02")?.map((a) => a.id)).toEqual(["m"]);
    expect(grouped.get("2026-07-03") ?? []).toEqual([]);
  });

  it("groups activities into their day bucket", () => {
    const acts: CalendarActivity[] = [
      {
        id: "1",
        subject: "A",
        dueAt: new Date("2026-07-02T10:00:00Z"),
        allDay: false,
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
        allDay: false,
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
  });

  it("includeOverdue=true keeps overdue activities in their due-day bucket", () => {
    const od: CalendarActivity = {
      id: "od",
      subject: "Past due",
      dueAt: new Date("2026-07-02T10:00:00Z"),
      allDay: false,
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
