import { describe, expect, it, vi } from "vitest";
import { doNotTrackEnabled, telemetryEnabled } from "./telemetryConfig";

describe("telemetryEnabled", () => {
  it("is true with key, host, and not disabled", () => {
    expect(telemetryEnabled({ key: "k", host: "https://h", disabled: false })).toBe(true);
  });
  it("is false when disabled, or key/host empty", () => {
    expect(telemetryEnabled({ key: "k", host: "https://h", disabled: true })).toBe(false);
    expect(telemetryEnabled({ key: "", host: "https://h", disabled: false })).toBe(false);
    expect(telemetryEnabled({ key: "k", host: "", disabled: false })).toBe(false);
  });
});

describe("doNotTrackEnabled", () => {
  it("reflects navigator.doNotTrack === '1'", () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    expect(doNotTrackEnabled()).toBe(true);
    vi.stubGlobal("navigator", { doNotTrack: "0" });
    expect(doNotTrackEnabled()).toBe(false);
  });
});
