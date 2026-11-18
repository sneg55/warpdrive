import { describe, expect, it } from "vitest";
import type { WizardStep } from "./wizardState";
import { activeDisplayStep, WIZARD_DISPLAY_STEPS } from "./wizardSteps";

describe("activeDisplayStep", () => {
  const cases: Array<[WizardStep, number]> = [
    ["upload", 0],
    ["preparing", 0],
    ["map", 1],
    ["validating", 1],
    ["preview", 2],
    ["commit", 3],
  ];
  for (const [step, index] of cases) {
    it(`maps ${step} to display index ${index}`, () => {
      expect(activeDisplayStep(step)).toBe(index);
    });
  }

  it("exposes exactly four display steps in order", () => {
    expect(WIZARD_DISPLAY_STEPS.map((s) => s.key)).toEqual(["upload", "map", "preview", "commit"]);
  });
});
