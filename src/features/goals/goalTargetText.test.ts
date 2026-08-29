import { describe, expect, it } from "vitest";
import { goalNumberText, goalTargetInput } from "./goalTargetText";

describe("goalNumberText", () => {
  it("drops the numeric column's empty cents from a count target", () => {
    expect(goalNumberText("200.00", "count")).toBe("200");
  });

  it("leaves a whole count alone", () => {
    expect(goalNumberText("111", "count")).toBe("111");
  });

  it("groups a large count", () => {
    expect(goalNumberText("2000.00", "count")).toBe("2,000");
  });

  it("rounds a count that somehow carries cents", () => {
    expect(goalNumberText("200.40", "count")).toBe("200");
  });

  it("drops empty cents from a value target", () => {
    expect(goalNumberText("20000.00", "value")).toBe("20,000");
  });

  it("keeps real cents on a value target", () => {
    expect(goalNumberText("1500.50", "value")).toBe("1,500.50");
  });
});

describe("goalTargetInput", () => {
  it("hands the edit form a target with no trailing cents", () => {
    expect(goalTargetInput("200.00")).toBe("200");
  });

  it("keeps real cents and adds no grouping", () => {
    expect(goalTargetInput("1500.50")).toBe("1500.50");
  });
});
