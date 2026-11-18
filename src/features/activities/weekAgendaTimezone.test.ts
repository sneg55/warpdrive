import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "./calendar";
import { selectWindow } from "./calendarView";
import { groupByLocalDay } from "./weekAgenda";

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

function weekPlaces(anchorIso: string): { fetched: boolean; placed: boolean } {
  const { days, range } = selectWindow("week", anchorIso);
  const fetched = DUE >= range.from && DUE <= range.to;
  const dayIsos = days.map((d) => d.toISOString().slice(0, 10));
  const grouped = groupByLocalDay(fetched ? [activity()] : [], dayIsos, true);
  return { fetched, placed: [...grouped.values()].some((v) => v.length > 0) };
}

describe("week agenda under a viewer timezone west of UTC", () => {
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

  it("places the activity on the week its local day falls in", () => {
    expect(weekPlaces("2026-08-20")).toEqual({ fetched: true, placed: true });
  });

  it("does not place it on the next week", () => {
    expect(weekPlaces("2026-08-25").placed).toBe(false);
  });
});
