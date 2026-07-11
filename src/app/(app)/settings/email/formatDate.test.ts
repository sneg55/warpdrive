import { describe, expect, it } from "vitest";
import { formatCreatedOn } from "./formatDate";

describe("formatCreatedOn", () => {
  it("formats an ISO timestamp deterministically (fixed locale + UTC, no hydration drift)", () => {
    // Fixed en-US + UTC so the server-rendered HTML and the client hydration always agree,
    // regardless of the viewer's locale or time zone.
    expect(formatCreatedOn("2026-07-11T23:30:00.000Z")).toBe("Jul 11, 2026");
  });

  it("does not shift the date across a time-zone boundary (uses UTC, not local)", () => {
    // 00:30 UTC would be the previous day in the Americas if rendered in local time.
    expect(formatCreatedOn("2026-07-11T00:30:00.000Z")).toBe("Jul 11, 2026");
  });
});
