import { describe, expect, it } from "vitest";
import type { WizardStep } from "./wizardState";
import { activeDisplayStep, WIZARD_DISPLAY_STEPS } from "./wizardSteps";

describe("activeDisplayStep", () => {
  // The 6 internal states collapse onto 4 user-visible steps. The two transient background
  // phases fold into the step they belong to: preparing is still "Upload", validating is
  // still "Map columns", so the stepper never highlights a step the user cannot see.
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
