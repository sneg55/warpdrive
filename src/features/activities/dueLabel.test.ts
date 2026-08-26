import { describe, expect, it } from "vitest";
import { composeDueAt } from "./activityTime";
import { fmtDue } from "./dueLabel";

// Built the way the app builds it: an all-day activity stores LOCAL midnight, so a hardcoded
// UTC midnight would land on the previous day in western timezones and test the wrong thing.
const allDayIso = composeDueAt("2026-08-31", "").iso;
const timedIso = composeDueAt("2026-08-31", "14:30").iso;

describe("fmtDue", () => {
  it("shows the time on an activity that has one", () => {
    const label = fmtDue(timedIso, false);
    expect(label).toMatch(/\d/);
    expect(label).not.toBe("-");
  });

  // The reported bug as the user sees it in the list: an activity saved with no time was
  // rendering a midnight nobody picked.
  it("shows the day alone when no time was set", () => {
    const label = fmtDue(allDayIso, true);
    expect(label).not.toMatch(/00:00|12:00|AM|PM/i);
    expect(label).toMatch(/31/);
  });

  it("renders a dash when there is no date at all", () => {
    expect(fmtDue(null, false)).toBe("-");
  });
});
