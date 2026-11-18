import { compareVersions } from "./compareVersions";
import type { ReleaseRow, VersionStatus } from "./types";

const OFF: Omit<VersionStatus, "current" | "disabled"> = {
  latest: null,
  releaseUrl: null,
  releaseNotes: null,
  updateAvailable: null,
  checkedAt: null,
};

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
