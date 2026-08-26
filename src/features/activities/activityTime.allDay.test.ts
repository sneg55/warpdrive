import { describe, expect, test } from "vitest";
import { composeDueAt } from "./activityTime";

// The user's report: saving an activity with the time left blank stored it at midnight, so
// reopening showed 00:00 and the list rendered a time nobody chose.
describe("composeDueAt", () => {
  test("keeps a supplied time", () => {
    const r = composeDueAt("2026-08-31", "14:30");
    expect(r.allDay).toBe(false);
    expect(r.iso).not.toBeNull();
    expect(new Date(r.iso ?? "").getHours()).toBe(14);
  });

  test("marks a blank time as all-day rather than midnight", () => {
    const r = composeDueAt("2026-08-31", "");
    expect(r.allDay).toBe(true);
  });

  test("still pins an all-day activity to the right calendar day", () => {
    const r = composeDueAt("2026-08-31", "");
    const d = new Date(r.iso ?? "");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth() + 1).toBe(8);
    expect(d.getDate()).toBe(31);
  });

  // Midnight is a real time someone can pick, and it must not be mistaken for "no time set".
  test("a deliberately chosen midnight is not all-day", () => {
    const r = composeDueAt("2026-08-31", "00:00");
    expect(r.allDay).toBe(false);
  });

  test("no date at all yields no timestamp and no all-day claim", () => {
    const r = composeDueAt("", "09:00");
    expect(r.iso).toBeNull();
    expect(r.allDay).toBe(false);
  });

  test("an impossible date yields no timestamp", () => {
    expect(composeDueAt("2026-02-30", "09:00").iso).toBeNull();
  });
});
