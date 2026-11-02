import path from "node:path";
import { REPO_SLUG } from "@/constants/urls";
import type { RepoFacts } from "@/types/repoFacts";
import { loadRepoFacts } from "./loadRepoFacts";

const GITHUB_TIMEOUT_MS = 8000;

let pending: Promise<RepoFacts> | null = null;

export function getBuildRepoFacts(): Promise<RepoFacts> {
  pending ??= loadRepoFacts({
    repoSlug: REPO_SLUG,
    packageJsonPath: path.join(process.cwd(), "..", "package.json"),
    now: new Date(),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  return pending;
}
