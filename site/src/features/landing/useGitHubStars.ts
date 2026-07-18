"use client";
import { useEffect, useState } from "react";

// Live star count for the public repo, shown in the landing nav. Client-side because the site is a
// static export with no server. Any failure (bad status, network error, unexpected payload) degrades
// to null so the badge just stays off, never a broken page. The request is aborted on unmount so a
// slow response cannot set state on an unmounted component.
export function useGitHubStars(repoUrl: string): number | null {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let repoPath: string;
    try {
      repoPath = new URL(repoUrl).pathname.slice(1);
    } catch {
      return;
    }
    if (repoPath === "") return;

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${repoPath}`, {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (typeof body !== "object" || body === null) return;
        const count = (body as Record<string, unknown>).stargazers_count;
        if (typeof count === "number") setStars(count);
      } catch {
        // Network error or abort: leave the badge off.
      }
    })();

    return () => controller.abort();
  }, [repoUrl]);

  return stars;
}
