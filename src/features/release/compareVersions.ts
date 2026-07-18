// Minimal semver parse + compare for the release-check banner. Kept internal (no `semver`
// dependency) because only GitHub release tags of the form `vX.Y.Z[-pre]` flow through here.
// Ported from pingcrm's version_checker: `true` iff `latest` is strictly newer than `current`,
// `null` when either side is missing or not semver (dev/SHA builds, malformed tags).

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

interface Semver {
  major: number;
  minor: number;
  patch: number;
  // Dot-separated prerelease identifiers, empty for a stable release.
  prerelease: string[];
}

// True iff `tag` looks like `X.Y.Z` (optionally `v`-prefixed, with prerelease/build metadata).
export function isSemver(tag: string): boolean {
  return SEMVER_RE.test(tag);
}

function parse(tag: string | null): Semver | null {
  if (tag === null || tag.length === 0) return null;
  const m = SEMVER_RE.exec(tag);
  if (m === null) return null;
  const [, major, minor, patch, pre] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: pre === undefined || pre.length === 0 ? [] : pre.split("."),
  };
}

const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

// Compare two prerelease identifiers by semver rules: numeric compared numerically,
// alphanumeric lexically, and numeric sorts lower than alphanumeric.
function compareIdentifier(ai: string, bi: string): number {
  const an = /^\d+$/.test(ai);
  const bn = /^\d+$/.test(bi);
  if (an && bn) return sign(Number(ai) - Number(bi));
  if (an !== bn) return an ? -1 : 1;
  return ai === bi ? 0 : ai < bi ? -1 : 1;
}

// Standard semver precedence for prerelease identifiers. A version with no prerelease
// outranks one with a prerelease; otherwise compare identifier-by-identifier, and a
// shorter prefix sorts lower when all preceding identifiers are equal.
function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return sign(a.length - b.length) * -1;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const cmp = compareIdentifier(a[i] ?? "", b[i] ?? "");
    if (cmp !== 0) return cmp;
  }
  return sign(a.length - b.length);
}

function order(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function compareVersions(current: string, latestTag: string | null): boolean | null {
  const currentV = parse(current);
  const latestV = parse(latestTag);
  if (currentV === null || latestV === null) return null;
  return order(latestV, currentV) > 0;
}
