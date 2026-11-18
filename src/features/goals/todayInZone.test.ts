import { describe, expect, test } from "vitest";
import { todayInZone } from "./todayInZone";

describe("todayInZone", () => {
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

  test("falls back to UTC when the zone is not a real one", () => {
    expect(todayInZone("Mars/Olympus_Mons", new Date("2026-03-02T04:00:00Z"))).toBe("2026-03-02");
  });
});
