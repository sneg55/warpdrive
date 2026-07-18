// Fields lifted from a GitHub release, as cached and returned to the client.
export interface ReleaseInfo {
  latestTag: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
}

// The cached release row plus its fetch timestamp (the shape read from `app_release_status`).
export interface ReleaseRow extends ReleaseInfo {
  fetchedAt: Date;
}

// Client-facing payload for the version-check query. Mirrors pingcrm's VersionData.
export interface VersionStatus {
  current: string;
  latest: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  updateAvailable: boolean | null;
  checkedAt: string | null;
  disabled: boolean;
}
