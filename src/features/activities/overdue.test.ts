import { describe, expect, test } from "vitest";
import { composeDueAt } from "./activityTime";
import { isActivityOverdue } from "./overdue";

const at = (ymd: string, hm: string) => new Date(composeDueAt(ymd, hm).iso ?? "");
const NOON = at("2026-08-31", "12:00").getTime();

describe("isActivityOverdue", () => {
  test("a timed activity earlier today is overdue", () => {
    expect(isActivityOverdue(at("2026-08-31", "09:00"), false, false, NOON)).toBe(true);
  });

  test("a timed activity later today is not", () => {
    expect(isActivityOverdue(at("2026-08-31", "17:00"), false, false, NOON)).toBe(false);
  });

  // An all-day activity is stored at midnight, so a raw instant comparison paints it red from
  // 00:01 on the very day it is due.
  test("an all-day activity due today is not overdue", () => {
    expect(isActivityOverdue(at("2026-08-31", ""), true, false, NOON)).toBe(false);
  });

  test("an all-day activity due yesterday is overdue", () => {
    expect(isActivityOverdue(at("2026-08-30", ""), true, false, NOON)).toBe(true);
  });

  test("an all-day activity due tomorrow is not overdue", () => {
    expect(isActivityOverdue(at("2026-09-01", ""), true, false, NOON)).toBe(false);
  });

  test("a done activity is never overdue", () => {
    expect(isActivityOverdue(at("2020-01-01", "09:00"), false, true, NOON)).toBe(false);
  });

  test("an undated activity has nothing to be overdue against", () => {
    expect(isActivityOverdue(null, false, false, NOON)).toBe(false);
  });
});
