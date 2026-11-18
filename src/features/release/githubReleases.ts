import { z } from "zod";
import { err, ok, type Result } from "@/types/result";
import { GITHUB_RELEASES_URL, RELEASE_FETCH_USER_AGENT } from "./constants";
import type { ReleaseInfo } from "./types";

const releaseResponseSchema = z.object({
  tag_name: z.string().nullish(),
  html_url: z.string().nullish(),
  body: z.string().nullish(),
});

export async function fetchLatestRelease(
  signal: AbortSignal,
): Promise<Result<ReleaseInfo, string>> {
  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": RELEASE_FETCH_USER_AGENT,
      },
    });
    if (!res.ok) return err(`github release fetch failed: HTTP ${res.status}`);

    const parsed = releaseResponseSchema.safeParse(await res.json());
    if (!parsed.success) return err("github release response malformed");

    return ok({
      latestTag: parsed.data.tag_name ?? null,
      releaseUrl: parsed.data.html_url ?? null,
      releaseNotes: parsed.data.body ?? null,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
