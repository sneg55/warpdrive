import type { Goal } from "@/db/schema/goals";

function hasCents(v: string): boolean {
  const dot = v.indexOf(".");
  return dot !== -1 && Number(v.slice(dot + 1)) !== 0;
}

export function goalNumberText(v: string, metric: Goal["metric"]): string {
  const fraction = metric === "count" ? 0 : hasCents(v) ? 2 : 0;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(Number(v));
}

export function goalTargetInput(v: string): string {
  return hasCents(v) ? v : String(Math.trunc(Number(v)));
}
