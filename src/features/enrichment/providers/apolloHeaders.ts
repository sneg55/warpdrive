import { pickNumber } from "./http";
import type { QuotaRemaining } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function selfThrottleUntil(headers: Headers, now: Date = new Date()): string | undefined {
  if (pickNumber(headers.get("x-24-hour-requests-left")) === 0) {
    return new Date(now.getTime() + DAY_MS).toISOString();
  }
  if (pickNumber(headers.get("x-hourly-requests-left")) === 0) {
    return new Date(now.getTime() + HOUR_MS).toISOString();
  }
  return undefined;
}

export function quotaRemainingFrom(headers: Headers): QuotaRemaining | undefined {
  const hourly = pickNumber(headers.get("x-hourly-requests-left"));
  const daily = pickNumber(headers.get("x-24-hour-requests-left"));
  if (hourly === undefined && daily === undefined) return undefined;
  return {
    ...(hourly === undefined ? {} : { hourly }),
    ...(daily === undefined ? {} : { daily }),
  };
}
