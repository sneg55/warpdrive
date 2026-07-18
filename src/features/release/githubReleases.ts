import { z } from "zod";
import { err, ok, type Result } from "@/types/result";
import { GITHUB_RELEASES_URL, RELEASE_FETCH_USER_AGENT } from "./constants";
import type { ReleaseInfo } from "./types";

// Validate the GitHub response at the boundary. Only the fields we surface are read; anything
// else is ignored. All three may be absent on a malformed/partial release, so they are nullish.
const releaseResponseSchema = z.object({
  tag_name: z.string().nullish(),
  html_url: z.string().nullish(),
  body: z.string().nullish(),
});

// Fetch the latest GitHub release. Every failure (non-2xx, network error, malformed JSON, abort)
// is an `err` value, never a throw, so the caller can log it and leave the last-good cache intact.
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
