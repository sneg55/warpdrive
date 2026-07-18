import { describe, expect, it } from "vitest";
import { resolveVersion } from "./resolveVersion";

describe("resolveVersion", () => {
  it("prefers a semver APP_VERSION env override", () => {
    expect(resolveVersion({ appVersionEnv: "1.2.0", packageVersion: "1.0.0" })).toBe("1.2.0");
    expect(resolveVersion({ appVersionEnv: "v1.2.0", packageVersion: "1.0.0" })).toBe("v1.2.0");
  });

  it("falls back to package.json version when the env override is unset", () => {
    expect(resolveVersion({ appVersionEnv: "", packageVersion: "1.0.0" })).toBe("1.0.0");
  });

  it("falls back to package.json version when the env override is not semver", () => {
    expect(resolveVersion({ appVersionEnv: "dev", packageVersion: "1.0.0" })).toBe("1.0.0");
    expect(resolveVersion({ appVersionEnv: "abc1234", packageVersion: "2.3.4" })).toBe("2.3.4");
  });

  it("returns 'dev' when neither source is a valid semver", () => {
    expect(resolveVersion({ appVersionEnv: "", packageVersion: undefined })).toBe("dev");
    expect(resolveVersion({ appVersionEnv: "dev", packageVersion: "garbage" })).toBe("dev");
    expect(resolveVersion({ appVersionEnv: "", packageVersion: "1.0" })).toBe("dev");
  });
});
