export interface ReleaseInfo {
  latestTag: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
}

export interface ReleaseRow extends ReleaseInfo {
  fetchedAt: Date;
}

export interface VersionStatus {
  current: string;
  latest: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  updateAvailable: boolean | null;
  checkedAt: string | null;
  disabled: boolean;
}
