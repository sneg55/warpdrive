import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import type { ReleaseFacts } from "@/types/repoFacts";

const S = STRINGS.landing.hero;

const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export function ReleaseLine({ release }: { release: ReleaseFacts | null }): ReactNode {
  if (release === null) return null;
  return (
    <p className="landing-rise landing-rise-4 mt-2 text-sm text-muted-foreground">
      {S.releasePrefix}{" "}
      <a
        href={`${S.releaseTagHref}${release.version}`}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {`v${release.version}`}
      </a>
      {" · "}
      <time dateTime={release.releasedOn}>
        {longDate.format(new Date(`${release.releasedOn}T00:00:00Z`))}
      </time>
    </p>
  );
}
