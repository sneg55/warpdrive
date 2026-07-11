import { describe, expect, it } from "vitest";
import { accentForOrder, funnelClip, stageSegmentStyle, tint } from "./boardStageHeader";

function alphaOf(rgba: string): number {
  const m = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(rgba);
  if (m === null) throw new Error(`not an rgba string: ${rgba}`);
  return Number.parseFloat(m[1] ?? "");
}

function rgbOf(rgba: string): string {
  const m = /^(rgba\(\d+, \d+, \d+),/.exec(rgba);
  if (m === null) throw new Error(`not an rgba string: ${rgba}`);
  return m[1] ?? "";
}

describe("tint", () => {
  it("converts a 6-digit hex to an rgba string at the given alpha", () => {
    expect(tint("#60a5fa", 0.15)).toBe("rgba(96, 165, 250, 0.15)");
  });

  it("tolerates hex without a leading hash", () => {
    expect(tint("34d399", 0.2)).toBe("rgba(52, 211, 153, 0.2)");
  });
});

describe("accentForOrder", () => {
  it("maps stage order onto the pipeline board's cool-to-warm ramp", () => {
    expect(accentForOrder(0)).toBe("#94a3b8"); // slate-400
    expect(accentForOrder(1)).toBe("#60a5fa"); // blue-400
    expect(accentForOrder(4)).toBe("#34d399"); // emerald-400
  });

  it("clamps orders past the ramp to the final (emerald) accent", () => {
    expect(accentForOrder(9)).toBe(accentForOrder(4));
  });
});

describe("stageSegmentStyle", () => {
  it("tints every state in the stage's own order-hue, never green or gray", () => {
    // A middle stage (order 2 = indigo) must read indigo in ALL states, not the
    // old uniform success-green / muted-gray. Same rgb across states = same hue.
    const hue = rgbOf(tint(accentForOrder(2), 1));
    expect(rgbOf(stageSegmentStyle(2, "future").backgroundColor)).toBe(hue);
    expect(rgbOf(stageSegmentStyle(2, "passed").backgroundColor)).toBe(hue);
    expect(rgbOf(stageSegmentStyle(2, "current").backgroundColor)).toBe(hue);
  });

  it("conveys progress by fill intensity: current >= passed > future", () => {
    const future = alphaOf(stageSegmentStyle(3, "future").backgroundColor);
    const passed = alphaOf(stageSegmentStyle(3, "passed").backgroundColor);
    const current = alphaOf(stageSegmentStyle(3, "current").backgroundColor);
    expect(passed).toBeGreaterThan(future);
    expect(current).toBeGreaterThanOrEqual(passed);
  });

  it("bolds only the current stage", () => {
    expect(stageSegmentStyle(1, "current").fontWeight).toBe(600);
    expect(stageSegmentStyle(1, "passed").fontWeight).toBe(400);
    expect(stageSegmentStyle(1, "future").fontWeight).toBe(400);
  });
});

describe("funnelClip", () => {
  it("gives the first segment a flat left edge (no left notch)", () => {
    const clip = funnelClip(true);
    expect(clip).toContain("100% 50%"); // still points right
    expect(clip).not.toContain(", 0.75rem 50%)"); // no left notch vertex
  });

  it("gives later segments a left notch so they interlock", () => {
    expect(funnelClip(false)).toContain("0.75rem 50%");
  });
});
