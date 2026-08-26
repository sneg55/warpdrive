import { describe, expect, test } from "vitest";
import { winRate } from "./winRate";

const bucket = (count: number) => ({ count, value: "0.00" });

describe("winRate", () => {
  test("is the won share of closed deals", () => {
    expect(winRate(bucket(3), bucket(1))).toBe(0.75);
  });

  test("is 1 when nothing was lost", () => {
    expect(winRate(bucket(4), bucket(0))).toBe(1);
  });

  test("is 0 when nothing was won", () => {
    expect(winRate(bucket(0), bucket(4))).toBe(0);
  });

  // A rate of zero and "nobody closed anything" are different facts and must not render
  // the same, so no-closed-deals returns null rather than 0.
  test("is null when no deal closed in the period", () => {
    expect(winRate(bucket(0), bucket(0))).toBeNull();
  });

  test("ignores open deals entirely", () => {
    expect(winRate(bucket(1), bucket(1))).toBe(0.5);
  });
});
