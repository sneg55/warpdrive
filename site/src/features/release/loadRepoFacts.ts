import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { RepoFacts } from "@/types/repoFacts";
import { resolveRepoFacts } from "./resolveRepoFacts";

const GITHUB_API = "https://api.github.com/repos";
const packageSchema = z.object({ version: z.string() });

async function fetchJsonOrNull(url: string, signal: AbortSignal): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function readPackageVersion(file: string): Promise<string | null> {
  try {
    const parsed = packageSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    return parsed.success ? parsed.data.version : null;
  } catch {
    return null;
  }
}

export async function loadRepoFacts(input: {
  repoSlug: string;
  packageJsonPath: string;
  now: Date;
  signal: AbortSignal;
}): Promise<RepoFacts> {
  const [repo, release, packageVersion] = await Promise.all([
    fetchJsonOrNull(`${GITHUB_API}/${input.repoSlug}`, input.signal),
    fetchJsonOrNull(`${GITHUB_API}/${input.repoSlug}/releases/latest`, input.signal),
    readPackageVersion(input.packageJsonPath),
  ]);
  return resolveRepoFacts({
    repoJson: repo,
    releaseJson: release,
    packageVersion,
    buildDate: input.now,
  });
}
