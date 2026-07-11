// Pipedrive's board columns are headed by a funnel: each stage is an arrow
// segment, tinted by its position, that points toward the next stage. These
// pure helpers build the clip-path and the accent tint so the header component
// stays declarative and the geometry stays unit-tested.

// Convert a "#rrggbb" (or "rrggbb") hex to an rgba() string at the given alpha.
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Order-derived accent (UI spec 8.5): left stages cooler, right stages warmer.
// Neutral slate -> blue -> indigo -> violet -> emerald (success near the final stage).
// This ramp is the pipeline board's stage identity; the deal-page stage bar inherits
// it (via stageSegmentStyle) so a deal's stages read in the same hues as its columns.
export const STAGE_ACCENT_RAMP = [
  "#94a3b8", // slate-400
  "#60a5fa", // blue-400
  "#818cf8", // indigo-400
  "#a78bfa", // violet-400
  "#34d399", // emerald-400
] as const;

export function accentForOrder(order: number): string {
  const idx = Math.min(Math.max(order, 0), STAGE_ACCENT_RAMP.length - 1);
  return STAGE_ACCENT_RAMP[idx] ?? "#94a3b8";
}

// Progress state of one segment in the deal-page stage bar.
export type StageSegmentState = "current" | "passed" | "future";

// Alpha per state: future matches the board header's 0.18 tint exactly; passed and
// current deepen the same hue so the bar reads as progress without switching colors.
const SEGMENT_ALPHA: Record<StageSegmentState, number> = {
  future: 0.18,
  passed: 0.55,
  current: 0.85,
};

// The fill + weight for one stage segment, tinted in that stage's order-hue. Keeps the
// deal-page chevrons (StageSelector, StageChevrons) in the pipeline's color language
// instead of a uniform success-green / muted-gray. Text stays dark (text-foreground)
// on the light-to-medium tints, matching the board headers, so contrast holds for any hue.
export function stageSegmentStyle(
  order: number,
  state: StageSegmentState,
): { backgroundColor: string; fontWeight: number } {
  return {
    backgroundColor: tint(accentForOrder(order), SEGMENT_ALPHA[state]),
    fontWeight: state === "current" ? 600 : 400,
  };
}

// Arrow segment: flat left edge for the first stage, a left notch for the rest
// so neighbours interlock. Right edge always points toward the next stage.
export function funnelClip(isFirst: boolean): string {
  const right = "calc(100% - 0.75rem) 0, 100% 50%, calc(100% - 0.75rem) 100%";
  return isFirst ? `polygon(0 0, ${right}, 0 100%)` : `polygon(0 0, ${right}, 0 100%, 0.75rem 50%)`;
}
