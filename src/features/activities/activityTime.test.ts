import { expect, it } from "vitest";
import { composeDueAtIso, deriveDurationMinutes } from "./activityTime";

it("composes an ISO dueAt from date + time without hardcoding 09:00", () => {
  const iso = composeDueAtIso("2026-07-04", "14:00");
  expect(iso).not.toBeNull();
  expect(new Date(iso as string).toISOString()).toBe(new Date("2026-07-04T14:00").toISOString());
});

it("uses midnight when the time is empty (all-day), not 09:00", () => {
  const iso = composeDueAtIso("2026-07-04", "");
  expect(new Date(iso as string).getHours()).toBe(0);
});

it("returns null dueAt when the date is empty", () => {
  expect(composeDueAtIso("", "14:00")).toBeNull();
});

it("derives duration from start and end times", () => {
  expect(deriveDurationMinutes("14:00", "14:30")).toBe(30);
});

it("returns null duration when end is not after start or a time is missing", () => {
  expect(deriveDurationMinutes("14:00", "13:00")).toBeNull();
  expect(deriveDurationMinutes("14:00", "")).toBeNull();
  expect(deriveDurationMinutes("", "14:30")).toBeNull();
});

it("returns null dueAt for a calendar-invalid date (no silent roll-forward)", () => {
  expect(composeDueAtIso("2026-02-30", "14:00")).toBeNull();
  expect(composeDueAtIso("2026-13-01", "14:00")).toBeNull();
});

it("returns null dueAt for a malformed date string", () => {
  expect(composeDueAtIso("not-a-date", "14:00")).toBeNull();
});

it("returns null duration at the equal start/end boundary", () => {
  expect(deriveDurationMinutes("14:00", "14:00")).toBeNull();
});

it("returns null duration for out-of-range times", () => {
  expect(deriveDurationMinutes("25:00", "14:30")).toBeNull();
  expect(deriveDurationMinutes("14:00", "14:70")).toBeNull();
});

it("treats non-zero-padded times as invalid (expects HH:mm)", () => {
  expect(deriveDurationMinutes("9:00", "10:00")).toBeNull();
});
