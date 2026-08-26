import { describe, expect, test } from "vitest";
import { aggregateStageConversion, aggregateStageSums } from "./aggregateStages";

const row = (order: number, name: string, reached: number) => ({
  stageId: `${name}-${order}`,
  name,
  order,
  reached,
  conversion: 0,
  medianDaysInStage: 3,
});

describe("aggregateStageConversion", () => {
  test("sums reach across pipelines position by position", () => {
    const out = aggregateStageConversion([
      [row(0, "Lead", 10), row(1, "Demo", 4)],
      [row(0, "Lead", 6), row(1, "Demo", 2)],
    ]);
    expect(out.map((r) => r.reached)).toEqual([16, 6]);
  });

  test("recomputes conversion against the aggregated first position", () => {
    const out = aggregateStageConversion([
      [row(0, "Lead", 10), row(1, "Demo", 5)],
      [row(0, "Lead", 10), row(1, "Demo", 5)],
    ]);
    expect(out.map((r) => r.conversion)).toEqual([1, 0.5]);
  });

  test("keeps the shared stage name when every pipeline agrees", () => {
    const out = aggregateStageConversion([[row(0, "Lead", 1)], [row(0, "Lead", 1)]]);
    expect(out[0]?.name).toBe("Lead");
  });

  // Two pipelines can call position 2 different things, and inventing a merged label would
  // misreport both. The position is the only honest name left.
  test("falls back to the position when pipelines disagree on the name", () => {
    const out = aggregateStageConversion([[row(1, "Demo", 1)], [row(1, "Trial", 1)]]);
    expect(out[0]?.name).toBe("Stage 2");
  });

  // A median cannot be rebuilt from other medians, so aggregating drops it rather than
  // reporting a number that is not one.
  test("drops days-in-stage once more than one pipeline contributes", () => {
    const out = aggregateStageConversion([[row(0, "Lead", 1)], [row(0, "Lead", 1)]]);
    expect(out[0]?.medianDaysInStage).toBeNull();
  });

  test("keeps days-in-stage when only one pipeline contributes to that position", () => {
    const out = aggregateStageConversion([
      [row(0, "Lead", 1), row(1, "Demo", 1)],
      [row(0, "Lead", 1)],
    ]);
    expect(out[1]?.medianDaysInStage).toBe(3);
  });

  test("orders positions ascending even when the inputs are ragged", () => {
    const out = aggregateStageConversion([[row(2, "C", 1)], [row(0, "A", 1), row(1, "B", 1)]]);
    expect(out.map((r) => r.order)).toEqual([0, 1, 2]);
  });

  test("returns nothing for no pipelines", () => {
    expect(aggregateStageConversion([])).toEqual([]);
  });

  test("conversion is 0 everywhere when the first position is empty", () => {
    const out = aggregateStageConversion([[row(0, "Lead", 0), row(1, "Demo", 0)]]);
    expect(out.map((r) => r.conversion)).toEqual([0, 0]);
  });
});

const sum = (order: number, name: string, dealCount: number, total: string) => ({
  stageId: `${name}-${order}`,
  name,
  order,
  dealCount,
  total,
});

describe("aggregateStageSums", () => {
  test("adds counts and totals position by position", () => {
    const out = aggregateStageSums([[sum(0, "Lead", 3, "100.00")], [sum(0, "Lead", 2, "50.50")]]);
    expect(out[0]?.dealCount).toBe(5);
    expect(out[0]?.total).toBe("150.50");
  });

  test("falls back to the position when pipelines disagree on the name", () => {
    const out = aggregateStageSums([[sum(1, "Demo", 1, "1.00")], [sum(1, "Trial", 1, "1.00")]]);
    expect(out[0]?.name).toBe("Stage 2");
  });

  test("orders positions ascending", () => {
    const out = aggregateStageSums([[sum(2, "C", 1, "1.00"), sum(0, "A", 1, "1.00")]]);
    expect(out.map((r) => r.order)).toEqual([0, 2]);
  });
});
