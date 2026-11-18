import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import type { ReleaseFacts } from "@/types/repoFacts";

const S = STRINGS.landing.hero;

const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export function ReleaseLine({ release }: { release: ReleaseFacts | null }): ReactNode {
  if (release === null) return null;
  return (
    <p className="landing-rise inline-flex items-center gap-2 rounded-full border bg-card py-1 pl-1.5 pr-3 text-xs text-muted-foreground shadow-[0_1px_2px_rgb(15_23_42/0.05)]">
      <span className="rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-link">
        {S.releasePrefix}
      </span>
      <a
        href={`${S.releaseTagHref}${release.version}`}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-foreground underline-offset-4 hover:text-link hover:underline"
      >
        {`v${release.version}`}
      </a>
      <span aria-hidden="true">·</span>
      <time dateTime={release.releasedOn}>
        {longDate.format(new Date(`${release.releasedOn}T00:00:00Z`))}
      </time>
    </p>
  );
}
