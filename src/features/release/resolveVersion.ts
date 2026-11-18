import { isSemver } from "./compareVersions";

export interface VersionSources {
  appVersionEnv: string;
  packageVersion: string | undefined;
}

export function resolveVersion({ appVersionEnv, packageVersion }: VersionSources): string {
  if (appVersionEnv.length > 0 && isSemver(appVersionEnv)) return appVersionEnv;
  if (packageVersion !== undefined && isSemver(packageVersion)) return packageVersion;
  return "dev";
}
