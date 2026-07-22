import { describe, expect, it } from "vitest";
import { activityState, activityTooltip, rottingState } from "./cardIndicators";

const now = new Date("2026-06-29T12:00:00Z");

describe("activityState", () => {
  it("none when no next activity", () => {
    expect(activityState(null, now)).toBe("none");
  });

  it("overdue when in the past", () => {
    expect(activityState(new Date("2026-06-28T12:00:00Z"), now)).toBe("overdue");
  });

  it("today when within the same UTC day", () => {
    expect(activityState(new Date("2026-06-29T20:00:00Z"), now)).toBe("today");
  });

  it("today (not overdue) when due earlier the same day", () => {
    // An activity due at 09:00 when it is now 12:00 is still 'due today', not overdue: overdue
    // means a prior calendar day.
    expect(activityState(new Date("2026-06-29T09:00:00Z"), now)).toBe("today");
  });

  it("upcoming when on a later day", () => {
    expect(activityState(new Date("2026-07-02T09:00:00Z"), now)).toBe("upcoming");
  });
});

describe("activityTooltip", () => {
  const subject = "Call Acme back";

  it("says nothing is scheduled when there is no next activity", () => {
    expect(activityTooltip(subject, null, now)).toBe("No activity scheduled");
  });

  it("names the activity and 'today' when due the same UTC day", () => {
    expect(activityTooltip(subject, new Date("2026-06-29T09:00:00Z"), now)).toBe(
      "Call Acme back · today",
    );
  });

  it("counts a single upcoming day in the singular", () => {
    expect(activityTooltip(subject, new Date("2026-06-30T09:00:00Z"), now)).toBe(
      "Call Acme back · in 1 day",
    );
  });

  it("counts several upcoming days in the plural", () => {
    expect(activityTooltip(subject, new Date("2026-07-03T09:00:00Z"), now)).toBe(
      "Call Acme back · in 4 days",
    );
  });

  it("counts a single overdue day in the singular", () => {
    expect(activityTooltip(subject, new Date("2026-06-28T09:00:00Z"), now)).toBe(
      "Call Acme back · 1 day overdue",
    );
  });

  it("counts several overdue days in the plural", () => {
    expect(activityTooltip(subject, new Date("2026-06-26T09:00:00Z"), now)).toBe(
      "Call Acme back · 3 days overdue",
    );
  });

  it("falls back to a generic noun when the subject is unknown", () => {
    expect(activityTooltip(null, new Date("2026-06-29T09:00:00Z"), now)).toBe("Activity · today");
  });
});

describe("rottingState", () => {
  it("not rotting when stage has no threshold", () => {
    expect(rottingState(new Date("2026-01-01T00:00:00Z"), null, now).rotting).toBe(false);
  });

  it("rotting when idle past the threshold", () => {
    const r = rottingState(new Date("2026-06-20T12:00:00Z"), 5, now);
    expect(r.rotting).toBe(true);
    expect(r.ageDays).toBe(9);
  });

  it("rotting flag agrees with the graded tint on the threshold day", () => {
    const at = (ageDays: number): Date => new Date(now.getTime() - ageDays * 86_400_000);
    // age == R renders level 0 (no red tint), so the card must not be flagged rotting either.
    const atThreshold = rottingState(at(6), 6, now);
    expect(atThreshold.rotting).toBe(false);
    expect(atThreshold.level).toBe(0);
    // strictly past R: both the flag and the tint turn on together.
    expect(rottingState(at(7), 6, now).rotting).toBe(true);
  });
});

describe("rottingState graded level", () => {
  // Reference now is fixed; vary the entered-at date to hit exact ages. R=6 gives R/2=3, so the
  // step boundaries (R, R+R/2, R+R) land on whole days: 6, 9, 12.
  const at = (ageDays: number): Date => new Date(now.getTime() - ageDays * 86_400_000);

  it("level 0 when no threshold", () => {
    expect(rottingState(at(30), null, now).level).toBe(0);
  });

  it("level 0 at or below the threshold (no red)", () => {
    expect(rottingState(at(5), 6, now).level).toBe(0);
    expect(rottingState(at(6), 6, now).level).toBe(0);
  });

  it("level 1 just past the threshold", () => {
    expect(rottingState(at(7), 6, now).level).toBe(1);
    expect(rottingState(at(8), 6, now).level).toBe(1);
  });

  it("level 2 after one more R/2 step", () => {
    expect(rottingState(at(9), 6, now).level).toBe(2);
  });

  it("level 3 after two more R/2 steps", () => {
    expect(rottingState(at(12), 6, now).level).toBe(3);
  });

  it("clamps at level 3 for very old deals", () => {
    expect(rottingState(at(60), 6, now).level).toBe(3);
  });
});
