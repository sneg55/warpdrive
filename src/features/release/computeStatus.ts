import { compareVersions } from "./compareVersions";
import type { ReleaseRow, VersionStatus } from "./types";

const OFF: Omit<VersionStatus, "current" | "disabled"> = {
  latest: null,
  releaseUrl: null,
  releaseNotes: null,
  updateAvailable: null,
  checkedAt: null,
};

// Derive the client payload from the running version and the cached release row.
// Disabled or no-row => no release data. Otherwise compute updateAvailable, which is
// null for non-semver (dev) builds where a comparison is meaningless.
export function computeStatus(
  current: string,
  row: ReleaseRow | null,
  disabled: boolean,
): VersionStatus {
  if (disabled) return { current, ...OFF, disabled: true };
  if (row === null) return { current, ...OFF, disabled: false };
  return {
    current,
    latest: row.latestTag,
    releaseUrl: row.releaseUrl,
    releaseNotes: row.releaseNotes,
    updateAvailable: compareVersions(current, row.latestTag),
    checkedAt: row.fetchedAt.toISOString(),
    disabled: false,
  };
}
