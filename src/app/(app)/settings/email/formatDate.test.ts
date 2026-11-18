import { describe, expect, it } from "vitest";
import { formatCreatedOn } from "./formatDate";

describe("formatCreatedOn", () => {
  it("formats an ISO timestamp deterministically (fixed locale + UTC, no hydration drift)", () => {
    expect(formatCreatedOn("2026-07-11T23:30:00.000Z")).toBe("Jul 11, 2026");
  });

  it("does not shift the date across a time-zone boundary (uses UTC, not local)", () => {
    expect(formatCreatedOn("2026-07-11T00:30:00.000Z")).toBe("Jul 11, 2026");
  });
});
