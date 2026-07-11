import { describe, expect, it } from "vitest";
import { buildStageProgress, timeInStageDays } from "./stageProgress";

const now = new Date("2026-07-08T00:00:00Z");

describe("stage progress", () => {
  it("counts whole days in stage", () => {
    expect(timeInStageDays(new Date("2026-07-02T00:00:00Z"), now)).toBe(6);
  });

  it("marks the current chip, prior chips passed, and flags rotting past threshold", () => {
    const stages = [
      { id: "s1", name: "Qualified", order: 0, rottingDays: 30 },
      { id: "s2", name: "Proposal", order: 1, rottingDays: 3 },
      { id: "s3", name: "Negotiation", order: 2, rottingDays: 30 },
    ];
    const deal = { stageId: "s2", stageEnteredAt: new Date("2026-07-02T00:00:00Z") };
    const p = buildStageProgress(deal, stages, now);
    expect(p.chips.map((c) => c.current)).toEqual([false, true, false]);
    expect(p.chips.map((c) => c.passed)).toEqual([true, false, false]);
    expect(p.daysInStage).toBe(6);
    expect(p.rotting).toBe(true); // 6 > 3
    // Option B: real days for the current stage, 0 for the others.
    expect(p.chips.map((c) => c.days)).toEqual([0, 6, 0]);
  });
});
