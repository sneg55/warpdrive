import { describe, expect, it } from "vitest";
import {
  allDayRowCount,
  layoutTimed,
  MAX_ALL_DAY_ROWS,
  splitAllDay,
  splitAllDayDisplay,
} from "./agendaLayout";
import type { CalendarActivity } from "./calendar";

// Local-time constructor: placeBlock reads local hours, so the fixtures must be built in the same
// frame or the expected topPx would depend on the machine's timezone.
function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 24, hour, minute);
}

function activity(over: Partial<CalendarActivity> & { id: string }): CalendarActivity {
  return {
    subject: over.id,
    dueAt: at(9),
    allDay: false,
    durationMinutes: 60,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
    ...over,
  };
}

describe("splitAllDay", () => {
  it("separates all-day activities from timed ones", () => {
    const a = activity({ id: "a", allDay: true });
    const b = activity({ id: "b" });
    expect(splitAllDay([a, b])).toEqual({ allDay: [a], timed: [b] });
  });

  it("keeps an untimed activity out of the hour grid rather than pinning it to midnight", () => {
    // An all-day activity is stored at midnight, so left in the grid it renders as a 00:00 block
    // with the whole day empty beneath it.
    const a = activity({ id: "a", allDay: true, dueAt: at(0), durationMinutes: null });
    expect(splitAllDay([a]).timed).toEqual([]);
  });
});

describe("layoutTimed", () => {
  it("gives a lone activity the full column width", () => {
    const [p] = layoutTimed([activity({ id: "a", dueAt: at(9) })]).placements;
    expect(p).toMatchObject({ leftPct: 0, widthPct: 100, topPx: 9 * 48, heightPx: 48 });
  });

  it("splits two overlapping activities into side-by-side halves", () => {
    const { placements: out } = layoutTimed([
      activity({ id: "a", dueAt: at(9) }),
      activity({ id: "b", dueAt: at(9, 30) }),
    ]);
    expect(out.map((p) => [p.activity.id, p.leftPct, p.widthPct])).toEqual([
      ["a", 0, 50],
      ["b", 50, 50],
    ]);
  });

  it("stops at two side-by-side lanes rather than shrinking a third of a column into initials", () => {
    const { placements: out, overflows } = layoutTimed([
      activity({ id: "a", dueAt: at(9) }),
      activity({ id: "b", dueAt: at(9, 15) }),
      activity({ id: "c", dueAt: at(9, 30) }),
    ]);
    expect(out.map((p) => p.activity.id)).toEqual(["a"]);
    expect(overflows[0]?.activities.map((a) => a.id)).toEqual(["b", "c"]);
  });

  it("gives back the full width once an activity no longer overlaps the previous one", () => {
    const { placements: out } = layoutTimed([
      activity({ id: "a", dueAt: at(9), durationMinutes: 60 }),
      activity({ id: "b", dueAt: at(11), durationMinutes: 60 }),
    ]);
    expect(out.map((p) => [p.leftPct, p.widthPct])).toEqual([
      [0, 100],
      [0, 100],
    ]);
  });

  it("reuses a freed lane inside one cluster instead of narrowing every activity in it", () => {
    // b and c do not overlap each other, so the cluster is two lanes wide, not three.
    const { placements: out } = layoutTimed([
      activity({ id: "a", dueAt: at(9), durationMinutes: 120 }),
      activity({ id: "b", dueAt: at(9, 30), durationMinutes: 30 }),
      activity({ id: "c", dueAt: at(10, 30), durationMinutes: 60 }),
    ]);
    expect(out.map((p) => [p.activity.id, p.leftPct, p.widthPct])).toEqual([
      ["a", 0, 50],
      ["b", 50, 50],
      ["c", 50, 50],
    ]);
  });

  it("treats a duration-less activity as its minimum visible block when deciding overlap", () => {
    // Both render as half-hour blocks at 12:36, so they collide on screen and must share the width.
    const { placements: out } = layoutTimed([
      activity({ id: "a", dueAt: at(12, 36), durationMinutes: null }),
      activity({ id: "b", dueAt: at(12, 36), durationMinutes: null }),
    ]);
    expect(out.map((p) => p.widthPct)).toEqual([50, 50]);
  });

  it("orders activities sharing a start time by id so the lanes do not jitter between renders", () => {
    const { placements: out } = layoutTimed([
      activity({ id: "b", dueAt: at(9) }),
      activity({ id: "a", dueAt: at(9) }),
    ]);
    expect(out.map((p) => p.activity.id)).toEqual(["a", "b"]);
  });
});

describe("layoutTimed overflow", () => {
  it("stops narrowing past the lane cap and collapses the rest into one overflow block", () => {
    // Five activities at the same minute would each be a fifth of a ~200px column: too narrow to
    // read one word, which is what made a busy day unreadable.
    const items = ["a", "b", "c", "d", "e"].map((id) => activity({ id, dueAt: at(9) }));
    const { placements, overflows } = layoutTimed(items);
    expect(placements.map((p) => p.activity.id)).toEqual(["a"]);
    expect(overflows).toHaveLength(1);
    expect(overflows[0]?.activities.map((a) => a.id)).toEqual(["b", "c", "d", "e"]);
  });

  it("marks the surviving chip as sharing its row with a more-chip", () => {
    // 30% of a 180px column is 54px, which clips "+5 more" to "+5 ...". The renderer needs to know
    // which chips sit beside a more-chip so it can give that chip a pixel floor.
    const items = ["a", "b", "c"].map((id) => activity({ id, dueAt: at(9) }));
    const { placements } = layoutTimed(items);
    expect(placements[0]?.overflowing).toBe(true);
  });

  it("leaves a cluster that fits within the cap unflagged", () => {
    const items = ["a", "b"].map((id) => activity({ id, dueAt: at(9) }));
    const { placements } = layoutTimed(items);
    expect(placements.map((p) => p.overflowing)).toEqual([false, false]);
  });

  it("leaves a cluster that fits within the cap untouched", () => {
    const items = ["a", "b"].map((id) => activity({ id, dueAt: at(9) }));
    const { placements, overflows } = layoutTimed(items);
    expect(placements.map((p) => p.widthPct)).toEqual([50, 50]);
    expect(overflows).toEqual([]);
  });

  it("spans the overflow block over the hidden activities it stands for", () => {
    // a holds the one visible lane 09:00-13:00; b, c and d are pushed into the more-chip, which
    // therefore has to cover 09:00 to 13:00, not just b's own hour.
    const items = [
      activity({ id: "a", dueAt: at(9), durationMinutes: 240 }),
      activity({ id: "b", dueAt: at(9), durationMinutes: 240 }),
      activity({ id: "c", dueAt: at(9), durationMinutes: 60 }),
      activity({ id: "d", dueAt: at(11), durationMinutes: 60 }),
    ];
    const { overflows } = layoutTimed(items);
    expect(overflows[0]?.activities.map((a) => a.id)).toEqual(["b", "c", "d"]);
    expect(overflows[0]).toMatchObject({ topPx: 9 * 48, heightPx: 4 * 48 });
  });

  it("keeps a later, separate cluster at full width after an earlier one overflowed", () => {
    const busy = ["a", "b", "c", "d"].map((id) => activity({ id, dueAt: at(9) }));
    const later = activity({ id: "z", dueAt: at(15) });
    const { placements } = layoutTimed([...busy, later]);
    expect(placements.find((p) => p.activity.id === "z")).toMatchObject({
      leftPct: 0,
      widthPct: 100,
    });
  });
});

function allDayDay(n: number): CalendarActivity[] {
  return Array.from({ length: n }, (_, i) => activity({ id: `a${i}`, allDay: true }));
}

describe("allDayRowCount", () => {
  it("reserves the busiest day's lane height", () => {
    expect(allDayRowCount([allDayDay(1), allDayDay(2)])).toBe(2);
  });

  it("stops the lane growing past the cap, so a busy day cannot push the hour grid off screen", () => {
    expect(allDayRowCount([allDayDay(12)])).toBe(MAX_ALL_DAY_ROWS);
  });
});

describe("splitAllDayDisplay", () => {
  it("shows every all-day activity when they fit in the reserved rows", () => {
    const items = allDayDay(2);
    expect(splitAllDayDisplay(items, 3)).toEqual({ visible: items, hidden: [] });
  });

  it("gives up one row to the more-chip so the count itself is never what gets cut off", () => {
    const { visible, hidden } = splitAllDayDisplay(allDayDay(5), 3);
    expect(visible.map((a) => a.id)).toEqual(["a0", "a1"]);
    expect(hidden.map((a) => a.id)).toEqual(["a2", "a3", "a4"]);
  });
});
