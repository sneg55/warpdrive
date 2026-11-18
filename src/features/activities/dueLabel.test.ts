import { describe, expect, it } from "vitest";
import { composeDueAt } from "./activityTime";
import { fmtDue } from "./dueLabel";

const allDayIso = composeDueAt("2026-08-31", "").iso;
const timedIso = composeDueAt("2026-08-31", "14:30").iso;

describe("fmtDue", () => {
  it("shows the time on an activity that has one", () => {
    const label = fmtDue(timedIso, false);
    expect(label).toMatch(/\d/);
    expect(label).not.toBe("-");
  });

  it("shows the day alone when no time was set", () => {
    const label = fmtDue(allDayIso, true);
    expect(label).not.toMatch(/00:00|12:00|AM|PM/i);
    expect(label).toMatch(/31/);
  });

  it("renders a dash when there is no date at all", () => {
    expect(fmtDue(null, false)).toBe("-");
  });
});
