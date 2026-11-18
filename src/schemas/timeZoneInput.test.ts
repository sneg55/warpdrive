import { describe, expect, it } from "vitest";
import { timeZoneInput } from "./timeZoneInput";

describe("timeZoneInput", () => {
  it.each([
    ["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Europe/Kiev", "Europe/Kyiv"],
    ["US/Eastern", "America/New_York"],
  ])("canonicalizes the legacy browser zone %s to %s as it enters the server", (legacy, primary) => {
    expect(timeZoneInput.parse(legacy)).toBe(primary);
  });

  it("passes a canonical zone through unchanged", () => {
    expect(timeZoneInput.parse("America/New_York")).toBe("America/New_York");
    expect(timeZoneInput.parse("UTC")).toBe("UTC");
  });

  it("degrades a zone no engine knows to UTC instead of rejecting the request", () => {
    expect(timeZoneInput.parse("Mars/Olympus")).toBe("UTC");
  });

  it("keeps an absent zone absent so a saved preference can still win", () => {
    expect(timeZoneInput.parse(undefined)).toBeUndefined();
  });
});
