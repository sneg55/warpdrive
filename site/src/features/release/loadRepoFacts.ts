import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { RepoFacts } from "@/types/repoFacts";
import { resolveRepoFacts } from "./resolveRepoFacts";

const GITHUB_API = "https://api.github.com/repos";
const packageSchema = z.object({ version: z.string() });

async function fetchJsonOrNull(url: string, signal: AbortSignal): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
      signal,
    });
    if (res.ok) return await res.json();
    const remaining = res.headers.get("x-ratelimit-remaining") ?? "unknown";
    console.warn(`repo facts: GitHub ${res.status} for ${url} (ratelimit-remaining=${remaining})`);
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown error";
    console.warn(`repo facts: GitHub request failed for ${url} (${reason})`);
    return null;
  }
}

async function readJsonOrNull(file: string | undefined): Promise<unknown> {
  if (file === undefined) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function readPackageVersion(file: string): Promise<string | null> {
  const parsed = packageSchema.safeParse(await readJsonOrNull(file));
  return parsed.success ? parsed.data.version : null;
}

export async function loadRepoFacts(input: {
  repoSlug: string;
  packageJsonPath: string;
  stampedFactsPath?: string;
  now: Date;
  signal: AbortSignal;
}): Promise<RepoFacts> {
  const [repo, release, packageVersion, stamped] = await Promise.all([
    fetchJsonOrNull(`${GITHUB_API}/${input.repoSlug}`, input.signal),
    fetchJsonOrNull(`${GITHUB_API}/${input.repoSlug}/releases/latest`, input.signal),
    readPackageVersion(input.packageJsonPath),
    readJsonOrNull(input.stampedFactsPath),
  ]);
  return resolveRepoFacts({
    repoJson: repo,
    releaseJson: release,
    packageVersion,
    buildDate: input.now,
    stampedJson: stamped,
  });
}
