import { describe, expect, it } from "vitest";
import { isFutureScheduledSend } from "./sendScheduling";

describe("isFutureScheduledSend", () => {
  const now = 1_000_000;

  it("is false when scheduledSendAt is undefined (immediate send)", () => {
    expect(isFutureScheduledSend(undefined, now)).toBe(false);
  });

  it("is true when scheduledSendAt is strictly after now", () => {
    expect(isFutureScheduledSend(new Date(now + 1), now)).toBe(true);
  });

  it("is false when scheduledSendAt is exactly now", () => {
    expect(isFutureScheduledSend(new Date(now), now)).toBe(false);
  });

  it("is false when scheduledSendAt is in the past (due)", () => {
    expect(isFutureScheduledSend(new Date(now - 60_000), now)).toBe(false);
  });
});
