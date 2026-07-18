import { describe, expect, it } from "vitest";
import { isSemver } from "./compareVersions";
import { getCurrentVersion, readPackageVersion } from "./currentVersion";

describe("currentVersion", () => {
  it("reads a semver version field from the bundled package.json", () => {
    const v = readPackageVersion();
    expect(v).toBeDefined();
    expect(isSemver(v ?? "")).toBe(true);
  });

  it("resolves to the package.json version when APP_VERSION is unstamped (test env)", () => {
    // vitest.setup provides no APP_VERSION, so it defaults to "" and the package.json wins.
    expect(getCurrentVersion()).toBe(readPackageVersion());
  });
});
