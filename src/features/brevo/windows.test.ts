import { describe, expect, it } from "vitest";
import { BREVO_HISTORY_START, BREVO_WINDOW_DAYS } from "@/constants/brevo";
import { addDays, coveredThroughAfter, daysBetween, planWindows, startDateFor } from "./windows";

const TODAY = "2026-11-25";

describe("startDateFor", () => {
  it("starts at the history start when nothing is covered", () => {
    expect(startDateFor(null, TODAY)).toBe(BREVO_HISTORY_START);
  });

  it("re-reads the last 90 days when coverage reaches yesterday", () => {
    expect(startDateFor("2026-11-24", TODAY)).toBe(addDays(TODAY, -89));
  });

  it("starts the day after coverage when the gap is longer than the overlap", () => {
    const covered = addDays(TODAY, -200);
    expect(startDateFor(covered, TODAY)).toBe(addDays(covered, 1));
  });
});

describe("planWindows", () => {
  it("covers the history start to today with contiguous windows of at most 90 days", () => {
    const windows = planWindows(BREVO_HISTORY_START, TODAY);
    expect(windows[0]?.startDate).toBe(BREVO_HISTORY_START);
    expect(windows.at(-1)?.endDate).toBe(TODAY);
    for (const [i, w] of windows.entries()) {
      expect(daysBetween(w.startDate, w.endDate) + 1).toBeLessThanOrEqual(BREVO_WINDOW_DAYS);
      const prev = windows[i - 1];
      if (prev !== undefined) expect(w.startDate).toBe(addDays(prev.endDate, 1));
    }
  });

  it("needs three windows to fill a 200 day gap", () => {
    const covered = addDays(TODAY, -200);
    const windows = planWindows(startDateFor(covered, TODAY), TODAY);
    expect(windows).toHaveLength(3);
    expect(windows.at(-1)?.endDate).toBe(TODAY);
  });

  it("needs one window for the overlap re-read", () => {
    expect(planWindows(startDateFor("2026-11-24", TODAY), TODAY)).toHaveLength(1);
  });

  it("returns nothing when the start is after today", () => {
    expect(planWindows("2026-11-26", TODAY)).toEqual([]);
  });
});

describe("coveredThroughAfter", () => {
  it("never counts today as covered", () => {
    expect(coveredThroughAfter(TODAY, TODAY)).toBe("2026-11-24");
  });

  it("uses the window end when it is before yesterday", () => {
    expect(coveredThroughAfter("2026-02-01", TODAY)).toBe("2026-02-01");
  });
});
