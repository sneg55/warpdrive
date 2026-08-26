// The week agenda buckets activities by the VIEWER'S local day (groupByLocalDay) while the
// server fetches a range built from UTC day boundaries (selectWindow). West of UTC the two
// frames disagree: an activity in the first hours of Monday UTC belongs to the previous local
// week, so this week's grid correctly refuses it, but the previous week's UTC range never
// reached it. The result is an activity that renders on no week at all.
//
// Prod case: three activities sat at 2026-08-24T04:00:00Z. Under America/Los_Angeles two of
// them were invisible on every week view.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "./calendar";
import { selectWindow } from "./calendarView";
import { groupByLocalDay } from "./weekAgenda";

// 2026-08-24T04:00:00Z is Sun 2026-08-23 21:00 in America/Los_Angeles (UTC-7 in August).
const DUE = new Date("2026-08-24T04:00:00.000Z");

function activity(): CalendarActivity {
  return {
    id: "a1",
    subject: "Check whether Ted or Alex re-engaged",
    dueAt: DUE,
    allDay: false,
    endAt: null,
    durationMinutes: null,
    typeKey: "task",
    done: false,
    dealId: "d1",
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: "Nick",
  };
}

// Would this week's server range have fetched the activity, and does the grid then place it?
function weekPlaces(anchorIso: string): { fetched: boolean; placed: boolean } {
  const { days, range } = selectWindow("week", anchorIso);
  const fetched = DUE >= range.from && DUE <= range.to;
  const dayIsos = days.map((d) => d.toISOString().slice(0, 10));
  const grouped = groupByLocalDay(fetched ? [activity()] : [], dayIsos, true);
  return { fetched, placed: [...grouped.values()].some((v) => v.length > 0) };
}

describe("week agenda under a viewer timezone west of UTC", () => {
  // vi.stubEnv, not a raw process.env write, so the env-boundary lint rule stays enforced.
  beforeAll(() => {
    vi.stubEnv("TZ", "America/Los_Angeles");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("confirms the fixture really is the previous local day in this timezone", () => {
    expect(DUE.getDate()).toBe(23);
    expect(DUE.getHours()).toBe(21);
  });

  // Its local day is Sunday 2026-08-23, which belongs to the Aug 17-23 week.
  it("places the activity on the week its local day falls in", () => {
    expect(weekPlaces("2026-08-20")).toEqual({ fetched: true, placed: true });
  });

  // And not on the following week, whose local days start at Monday the 24th.
  it("does not place it on the next week", () => {
    expect(weekPlaces("2026-08-25").placed).toBe(false);
  });
});
