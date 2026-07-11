import { describe, expect, it } from "vitest";
import { formatInboxListDate, formatReaderDate } from "./inboxDate";

const NOW = new Date("2026-07-09T12:00:00Z");

describe("formatInboxListDate", () => {
  it("formats a current-year date as short month + day (Pipedrive 'Jul 2'), no time or year", () => {
    const out = formatInboxListDate("2026-07-02T10:14:50Z", NOW);
    expect(out).toMatch(/^Jul\s+2$/);
    // No verbose time component and no year for the current year.
    expect(out).not.toMatch(/\d{4}/);
    expect(out).not.toMatch(/:/);
  });

  it("includes the year for an older message", () => {
    // Midday UTC so the local calendar day doesn't cross into an adjacent date under any timezone.
    expect(formatInboxListDate("2024-12-24T12:00:00Z", NOW)).toMatch(/[A-Z][a-z]{2}\s+\d+,\s+2024/);
  });

  it("returns empty string for null / unset / invalid", () => {
    expect(formatInboxListDate(null, NOW)).toBe("");
    expect(formatInboxListDate("", NOW)).toBe("");
    expect(formatInboxListDate("not-a-date", NOW)).toBe("");
  });
});

describe("formatReaderDate", () => {
  it("formats like Pipedrive: long month + day with a relative age, no seconds", () => {
    // 29 days before NOW (2026-07-09) -> June 10.
    const out = formatReaderDate("2026-06-10T09:00:00Z", NOW);
    expect(out).toMatch(/^June\s+10\s+\(29 days ago\)$/);
    expect(out).not.toMatch(/:/); // no clock time / seconds
  });

  it("says (today) and (yesterday) for the most recent messages", () => {
    expect(formatReaderDate("2026-07-09T08:00:00Z", NOW)).toMatch(/\(today\)$/);
    expect(formatReaderDate("2026-07-08T08:00:00Z", NOW)).toMatch(/\(yesterday\)$/);
  });

  it("includes the year for a message from a previous year", () => {
    expect(formatReaderDate("2024-12-24T12:00:00Z", NOW)).toMatch(/December\s+24,\s+2024/);
  });

  it("returns empty string for null / unset / invalid", () => {
    expect(formatReaderDate(null, NOW)).toBe("");
    expect(formatReaderDate("", NOW)).toBe("");
    expect(formatReaderDate("not-a-date", NOW)).toBe("");
  });
});
