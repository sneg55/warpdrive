import { describe, expect, test } from "vitest";
import { todayInZone } from "./todayInZone";

describe("todayInZone", () => {
  // 23:30 UTC is already tomorrow in Tokyo, which is the case that rolls a goal period a day
  // early or late when the date is taken from the viewer's browser instead.
  test("is already the next day in a zone ahead of UTC", () => {
    expect(todayInZone("Asia/Tokyo", new Date("2026-03-01T23:30:00Z"))).toBe("2026-03-02");
  });

  test("is still the previous day in a zone behind UTC", () => {
    expect(todayInZone("America/Los_Angeles", new Date("2026-03-02T04:00:00Z"))).toBe("2026-03-01");
  });

  test("matches UTC when the zone is UTC", () => {
    expect(todayInZone("UTC", new Date("2026-03-02T04:00:00Z"))).toBe("2026-03-02");
  });

  test("falls back to UTC when no zone is set", () => {
    expect(todayInZone(null, new Date("2026-03-02T04:00:00Z"))).toBe("2026-03-02");
  });

  // A stale or mistyped zone must not throw on a page load; UTC is the safe answer.
  test("falls back to UTC when the zone is not a real one", () => {
    expect(todayInZone("Mars/Olympus_Mons", new Date("2026-03-02T04:00:00Z"))).toBe("2026-03-02");
  });
});
