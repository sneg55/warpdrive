import type { ActivityLoadLevel } from "@/constants/activityLoad";
import { ACTIVITY_LOAD_LIGHT_RATIO, DEFAULT_DAILY_ACTIVITY_TARGET } from "@/constants/activityLoad";

export function activityLoadLevel(count: number, target: number): ActivityLoadLevel {
  const safeTarget = Number.isFinite(target) && target > 0 ? target : DEFAULT_DAILY_ACTIVITY_TARGET;
  if (count <= 0) return "none";
  if (count < safeTarget * ACTIVITY_LOAD_LIGHT_RATIO) return "light";
  if (count < safeTarget) return "near";
  return "full";
}
