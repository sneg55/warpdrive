export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const STAGE_ACCENT_RAMP = ["#94a3b8", "#60a5fa", "#818cf8", "#a78bfa", "#34d399"] as const;

export function accentForOrder(order: number): string {
  const idx = Math.min(Math.max(order, 0), STAGE_ACCENT_RAMP.length - 1);
  return STAGE_ACCENT_RAMP[idx] ?? "#94a3b8";
}

export type StageSegmentState = "current" | "passed" | "future";

const SEGMENT_ALPHA: Record<StageSegmentState, number> = {
  future: 0.18,
  passed: 0.55,
  current: 0.85,
};

export function stageSegmentStyle(
  order: number,
  state: StageSegmentState,
): { backgroundColor: string; fontWeight: number } {
  return {
    backgroundColor: tint(accentForOrder(order), SEGMENT_ALPHA[state]),
    fontWeight: state === "current" ? 600 : 400,
  };
}

export function funnelClip(isFirst: boolean): string {
  const right = "calc(100% - 0.75rem) 0, 100% 50%, calc(100% - 0.75rem) 100%";
  return isFirst ? `polygon(0 0, ${right}, 0 100%)` : `polygon(0 0, ${right}, 0 100%, 0.75rem 50%)`;
}
