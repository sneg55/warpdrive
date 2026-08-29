import { describe, expect, it } from "vitest";
import { goalChartPoints } from "./goalChartPoints";

const PERIOD = { start: "2026-03-01", end: "2026-03-04" };

describe("goalChartPoints", () => {
  it("carries a row for every day of the period, future days included", () => {
    const points = goalChartPoints(PERIOD, [{ day: "2026-03-01", actual: "2" }], "8");
    expect(points.map((p) => p.day)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
  });

  it("leaves the booked line unplotted past the last day the series covers", () => {
    const points = goalChartPoints(
      PERIOD,
      [
        { day: "2026-03-01", actual: "2" },
        { day: "2026-03-02", actual: "5" },
      ],
      "8",
    );
    expect(points.map((p) => p.actual)).toEqual([2, 5, null, null]);
  });

  it("walks the target line up to the target on the last day", () => {
    const points = goalChartPoints(PERIOD, [], "8");
    expect(points.map((p) => p.target)).toEqual([2, 4, 6, 8]);
  });

  it("puts the target line where pace measures it, so a line above it is behind", () => {
    const points = goalChartPoints(PERIOD, [{ day: "2026-03-01", actual: "2" }], "8");
    expect(points[0]?.target).toBe(2);
  });
});
