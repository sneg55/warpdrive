import { describe, expect, it } from "vitest";
import { compareVersions } from "./compareVersions";

describe("compareVersions", () => {
  it("returns true when latest is strictly newer", () => {
    expect(compareVersions("1.6.0", "1.7.0")).toBe(true);
    expect(compareVersions("1.6.0", "2.0.0")).toBe(true);
    expect(compareVersions("1.6.0", "1.6.1")).toBe(true);
  });

  it("returns false when latest is same or older", () => {
    expect(compareVersions("1.7.0", "1.7.0")).toBe(false);
    expect(compareVersions("1.7.0", "1.6.0")).toBe(false);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(false);
  });

  it("tolerates a leading v on either side", () => {
    expect(compareVersions("v1.6.0", "v1.7.0")).toBe(true);
    expect(compareVersions("1.6.0", "v1.6.0")).toBe(false);
  });

  it("returns null when the current version is not semver (dev/SHA builds)", () => {
    expect(compareVersions("dev", "1.7.0")).toBeNull();
    expect(compareVersions("abc1234", "1.7.0")).toBeNull();
  });

  it("returns null when the latest tag is missing or malformed", () => {
    expect(compareVersions("1.6.0", null)).toBeNull();
    expect(compareVersions("1.6.0", "")).toBeNull();
    expect(compareVersions("1.6.0", "garbage")).toBeNull();
    expect(compareVersions("1.6.0", "1.7")).toBeNull();
  });

  it("treats a stable release as newer than its own prerelease at the same numbers", () => {
    expect(compareVersions("1.7.0-rc.1", "1.7.0")).toBe(true);
    expect(compareVersions("1.7.0", "1.7.0-rc.1")).toBe(false);
  });

  it("orders prereleases of the same numbers by identifier", () => {
    expect(compareVersions("1.7.0-rc.1", "1.7.0-rc.2")).toBe(true);
    expect(compareVersions("1.7.0-rc.2", "1.7.0-rc.1")).toBe(false);
  });
});
