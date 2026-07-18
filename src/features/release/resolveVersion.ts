import { isSemver } from "./compareVersions";

export interface VersionSources {
  // Raw APP_VERSION env override (empty when not stamped at build).
  appVersionEnv: string;
  // `version` field from the bundled package.json, if readable.
  packageVersion: string | undefined;
}

// Resolve the running app version for the banner. Order: an explicit semver APP_VERSION
// (CI/build-arg stamp) wins, then the bundled package.json version (the OSS default, written
// by release-oss.sh --tag), then "dev" which disables the banner (compareVersions returns null).
export function resolveVersion({ appVersionEnv, packageVersion }: VersionSources): string {
  if (appVersionEnv.length > 0 && isSemver(appVersionEnv)) return appVersionEnv;
  if (packageVersion !== undefined && isSemver(packageVersion)) return packageVersion;
  return "dev";
}
