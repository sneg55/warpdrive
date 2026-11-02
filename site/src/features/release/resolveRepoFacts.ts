import { z } from "zod";
import type { ReleaseFacts, RepoFacts } from "@/types/repoFacts";

const repoSchema = z.object({ stargazers_count: z.number().int().nonnegative() });
const releaseSchema = z.object({ tag_name: z.string(), published_at: z.iso.datetime() });
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

type Triple = readonly [number, number, number];

function parseSemver(value: string): Triple | null {
  const match = SEMVER.exec(value);
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isNewer(candidate: Triple, baseline: Triple): boolean {
  for (let i = 0; i < 3; i++) {
    if (candidate[i] !== baseline[i]) return (candidate[i] ?? 0) > (baseline[i] ?? 0);
  }
  return false;
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveRelease(
  releaseJson: unknown,
  packageVersion: string | null,
  buildDate: Date,
): ReleaseFacts | null {
  const parsed = releaseSchema.safeParse(releaseJson);
  if (!parsed.success) return null;
  const published = parseSemver(parsed.data.tag_name);
  if (published === null) return null;
  const stamped = packageVersion === null ? null : parseSemver(packageVersion);
  if (stamped !== null && isNewer(stamped, published)) {
    return { version: stamped.join("."), releasedOn: toDay(buildDate) };
  }
  return { version: published.join("."), releasedOn: parsed.data.published_at.slice(0, 10) };
}

export function resolveRepoFacts(input: {
  repoJson: unknown;
  releaseJson: unknown;
  packageVersion: string | null;
  buildDate: Date;
}): RepoFacts {
  const repo = repoSchema.safeParse(input.repoJson);
  return {
    stars: repo.success ? repo.data.stargazers_count : null,
    release: resolveRelease(input.releaseJson, input.packageVersion, input.buildDate),
  };
}
