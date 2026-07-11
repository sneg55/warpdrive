// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { accentForOrder, tint } from "@/features/deals/boardStageHeader";
import { StageChevrons } from "./StageChevrons";

afterEach(cleanup);

function alphaOf(rgba: string): number {
  const m = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(rgba);
  return m === null ? Number.NaN : Number.parseFloat(m[1] ?? "");
}
function rgbPrefix(rgba: string): string {
  const m = /^(rgba\(\d+, \d+, \d+),/.exec(rgba);
  return m?.[1] ?? "";
}

describe("StageChevrons", () => {
  it("tints each segment in its stage's pipeline hue with progress-fill intensity, not green/gray", () => {
    const { getByTitle } = render(
      <StageChevrons
        chips={[
          { id: "a", name: "Qualified", current: false, passed: true }, // order 0 -> slate
          { id: "b", name: "Contact", current: true, passed: false }, // order 1 -> blue
          { id: "c", name: "Proposal", current: false, passed: false }, // order 2 -> indigo
        ]}
      />,
    );

    // Each segment reads in its own order-hue (inherited from the pipeline board).
    expect(rgbPrefix(getByTitle("Qualified").style.backgroundColor)).toBe(
      rgbPrefix(tint(accentForOrder(0), 1)),
    );
    expect(rgbPrefix(getByTitle("Contact").style.backgroundColor)).toBe(
      rgbPrefix(tint(accentForOrder(1), 1)),
    );
    expect(rgbPrefix(getByTitle("Proposal").style.backgroundColor)).toBe(
      rgbPrefix(tint(accentForOrder(2), 1)),
    );

    // Progress reads via fill intensity, and no leftover uniform token classes remain.
    const passed = alphaOf(getByTitle("Qualified").style.backgroundColor);
    const current = alphaOf(getByTitle("Contact").style.backgroundColor);
    const future = alphaOf(getByTitle("Proposal").style.backgroundColor);
    expect(passed).toBeGreaterThan(future);
    expect(current).toBeGreaterThanOrEqual(passed);
    for (const seg of ["Qualified", "Contact", "Proposal"]) {
      expect(getByTitle(seg).className).not.toContain("bg-success");
      expect(getByTitle(seg).className).not.toContain("bg-muted");
      expect(getByTitle(seg).className).not.toContain("bg-primary");
    }
  });
});
