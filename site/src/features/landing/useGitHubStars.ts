"use client";
import { useEffect, useState } from "react";

export function useGitHubStars(repoUrl: string, initialStars: number | null): number | null {
  const [stars, setStars] = useState<number | null>(initialStars);

  useEffect(() => {
    if (initialStars !== null) return;
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
  }, [repoUrl, initialStars]);

  return stars;
}
