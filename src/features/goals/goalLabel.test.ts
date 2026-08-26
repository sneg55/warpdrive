import { describe, expect, test } from "vitest";
import { goalLabel } from "./goalLabel";

const g = {
  subject: "deal" as const,
  action: "won" as const,
  metric: "value" as const,
  interval: "monthly" as const,
};

describe("goalLabel", () => {
  test("names a deal value goal", () => {
    expect(goalLabel(g)).toBe("Deal value won, monthly");
  });

  test("names a deal count goal", () => {
    expect(goalLabel({ ...g, metric: "count" })).toBe("Deals won, monthly");
  });

  test("names an activity completion goal", () => {
    expect(
      goalLabel({ subject: "activity", action: "completed", metric: "count", interval: "weekly" }),
    ).toBe("Activities completed, weekly");
  });

  test("names deals added quarterly", () => {
    expect(goalLabel({ ...g, action: "added", metric: "count", interval: "quarterly" })).toBe(
      "Deals added, quarterly",
    );
  });

  test("names a yearly lost-deal goal", () => {
    expect(goalLabel({ ...g, action: "lost", metric: "count", interval: "yearly" })).toBe(
      "Deals lost, yearly",
    );
  });
});
