export const DEFAULT_DAILY_ACTIVITY_TARGET = 5;
export const MIN_DAILY_ACTIVITY_TARGET = 1;
export const MAX_DAILY_ACTIVITY_TARGET = 50;

export type ActivityLoadLevel = "none" | "light" | "near" | "full";

export const ACTIVITY_LOAD_LIGHT_RATIO = 0.6;

export const ACTIVITY_LOAD_HINT = (count: number, target: number): string =>
  `${count} ${count === 1 ? "activity" : "activities"} scheduled, daily target ${target}`;
