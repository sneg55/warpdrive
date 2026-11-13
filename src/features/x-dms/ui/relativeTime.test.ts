import { describe, expect, it } from "vitest";
import { formatXRelativeTime } from "./relativeTime";

const now = new Date("2026-11-13T12:00:00.000Z");
const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();

describe("formatXRelativeTime", () => {
  it("says just now under a minute", () => {
    expect(formatXRelativeTime(ago(30_000), now)).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(formatXRelativeTime(ago(60_000), now)).toBe("a minute ago");
    expect(formatXRelativeTime(ago(5 * 60_000), now)).toBe("5 minutes ago");
    expect(formatXRelativeTime(ago(60 * 60_000), now)).toBe("1 hour ago");
    expect(formatXRelativeTime(ago(3 * 60 * 60_000), now)).toBe("3 hours ago");
    expect(formatXRelativeTime(ago(24 * 60 * 60_000), now)).toBe("1 day ago");
    expect(formatXRelativeTime(ago(9 * 24 * 60 * 60_000), now)).toBe("9 days ago");
  });

  it("treats a future time as just now and an invalid one as empty", () => {
    expect(formatXRelativeTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(
      "just now",
    );
    expect(formatXRelativeTime("not a date", now)).toBe("");
  });
});
