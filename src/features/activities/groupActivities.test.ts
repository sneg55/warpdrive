import { describe, expect, it } from "vitest";
import type { CalendarActivity } from "./calendar";
import { groupActivities } from "./groupActivities";

function act(id: string, dueIso: string, done = false): CalendarActivity {
  return {
    id,
    subject: id,
    dueAt: new Date(dueIso),
    durationMinutes: null,
    typeKey: "task",
    done,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
  };
}

const NOW = new Date("2026-07-01T12:00:00Z").getTime();

describe("groupActivities", () => {
  it("splits into overdue, today, and upcoming by calendar day", () => {
    const g = groupActivities(
      [
        act("yesterday", "2026-06-30T09:00:00Z"),
        act("today-am", "2026-07-01T08:00:00Z"),
        act("tomorrow", "2026-07-02T09:00:00Z"),
      ],
      NOW,
    );
    expect(g.overdue.map((a) => a.id)).toEqual(["yesterday"]);
    expect(g.today.map((a) => a.id)).toEqual(["today-am"]);
    expect(g.upcoming.map((a) => a.id)).toEqual(["tomorrow"]);
  });

  it("drops completed past activities (a done task is not overdue and does not resurface)", () => {
    const g = groupActivities([act("done-old", "2026-06-29T09:00:00Z", true)], NOW);
    expect(g.overdue).toHaveLength(0);
    expect(g.today).toHaveLength(0);
    expect(g.upcoming).toHaveLength(0);
  });

  it("sorts each group by due time ascending", () => {
    const g = groupActivities(
      [act("t-late", "2026-07-01T16:00:00Z"), act("t-early", "2026-07-01T07:00:00Z")],
      NOW,
    );
    expect(g.today.map((a) => a.id)).toEqual(["t-early", "t-late"]);
  });
});
