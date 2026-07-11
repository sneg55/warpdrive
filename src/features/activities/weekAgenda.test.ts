import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { composeDueAtIso } from "./activityTime";
import type { CalendarActivity } from "./calendar";
import {
  groupByLocalDay,
  HOUR_HEIGHT_PX,
  localDayIso,
  placeBlock,
  slotDateTime,
} from "./weekAgenda";

function mkActivity(id: string, dueAt: Date): CalendarActivity {
  return {
    id,
    subject: `Activity ${id}`,
    dueAt,
    durationMinutes: 60,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
  };
}

describe("weekAgenda", () => {
  it("places a 09:30 60-min block at the right offset + height", () => {
    const p = placeBlock(new Date(2026, 6, 15, 9, 30), 60);
    expect(p.topPx).toBe(9.5 * HOUR_HEIGHT_PX);
    expect(p.heightPx).toBe(HOUR_HEIGHT_PX);
  });

  it("gives a null-duration block a minimum half-hour height", () => {
    expect(placeBlock(new Date(2026, 6, 15, 9, 0), null).heightPx).toBe(HOUR_HEIGHT_PX / 2);
  });

  it("scales height for a multi-hour duration (3h meeting spans 3 hour-lanes)", () => {
    expect(placeBlock(new Date(2026, 6, 15, 13, 0), 180).heightPx).toBe(HOUR_HEIGHT_PX * 3);
  });

  it("places overlapping activities independently: each block's position depends only on its own dueAt/duration", () => {
    // 09:00-09:45 and 09:15-10:15 overlap in time. placeBlock has no collision-avoidance
    // (that is WeekAgendaGrid's rendering concern, not this pure math), so both must resolve
    // from their own inputs with no clamping against one another.
    const first = placeBlock(new Date(2026, 6, 15, 9, 0), 45);
    const second = placeBlock(new Date(2026, 6, 15, 9, 15), 60);
    expect(first).toEqual({ topPx: 9 * HOUR_HEIGHT_PX, heightPx: 0.75 * HOUR_HEIGHT_PX });
    expect(second).toEqual({ topPx: 9.25 * HOUR_HEIGHT_PX, heightPx: HOUR_HEIGHT_PX });
    // Confirm they do overlap vertically (sanity: proves the fixture actually exercises overlap).
    expect(second.topPx).toBeLessThan(first.topPx + first.heightPx);
  });

  it("slotDateTime returns the clicked day + zero-padded hour", () => {
    expect(slotDateTime("2026-07-15", 14)).toEqual({ date: "2026-07-15", time: "14:00" });
  });

  it("slotDateTime zero-pads single-digit hours", () => {
    expect(slotDateTime("2026-07-15", 5)).toEqual({ date: "2026-07-15", time: "05:00" });
  });
});

// Regression: the week agenda buckets a DAY column and places an HOUR lane from the SAME
// activity, so both must resolve in the same time frame (the viewer's local wall clock, since
// this is a client-rendered calendar). Pin the process timezone to a non-UTC zone so the bug
// (day bucketed in UTC, hour placed in local time) reproduces deterministically regardless of
// the machine running the suite.
describe("weekAgenda under a non-UTC timezone", () => {
  const dayIsos = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"];

  beforeAll(() => {
    // vi.stubEnv (not a raw process.env write) so the project's env-boundary lint rule stays
    // enforced; it mutates process.env under the hood, which is what Date's local getters read.
    vi.stubEnv("TZ", "America/New_York");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("READ: an activity whose UTC instant falls on the next UTC day is bucketed under its LOCAL day", () => {
    // 2026-07-16T02:00:00Z is Wed Jul 15 22:00 EDT (UTC-4). The UTC calendar day is Thursday,
    // but the local wall-clock day (and the hour lane placeBlock will render it in) is Wednesday.
    const dueAt = new Date("2026-07-16T02:00:00.000Z");
    expect(localDayIso(dueAt)).toBe("2026-07-15");

    const grouped = groupByLocalDay([mkActivity("evening-call", dueAt)], dayIsos, true);
    expect(grouped.get("2026-07-15")?.map((a) => a.id)).toEqual(["evening-call"]);
    expect(grouped.get("2026-07-16")?.map((a) => a.id)).toEqual([]);

    // Same activity's hour lane must agree with the day it was bucketed into: 22:00 local.
    const { topPx } = placeBlock(dueAt, 60);
    expect(topPx).toBe(22 * HOUR_HEIGHT_PX);
  });

  it("WRITE: clicking the Wed 22:00 empty slot creates a dueAt that re-buckets to the SAME local day", () => {
    const slot = slotDateTime("2026-07-15", 22);
    expect(slot).toEqual({ date: "2026-07-15", time: "22:00" });

    // composeDueAtIso treats its input as local wall-clock (matches the calendar's client-
    // rendered semantics), so the resulting instant must re-bucket back onto Jul 15, not 16.
    const createdIso = composeDueAtIso(slot.date, slot.time);
    expect(createdIso).not.toBeNull();
    const dueAt = new Date(createdIso as string);

    const grouped = groupByLocalDay([mkActivity("created", dueAt)], dayIsos, true);
    expect(grouped.get("2026-07-15")?.map((a) => a.id)).toEqual(["created"]);
    expect(grouped.get("2026-07-16")?.map((a) => a.id)).toEqual([]);
  });
});
