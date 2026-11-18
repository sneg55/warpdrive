import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import type { ReleaseFacts } from "@/types/repoFacts";
import { CTA_PRIMARY, CTA_SECONDARY } from "./ctaClasses";
import { ReleaseLine } from "./ReleaseLine";
import { SCREENSHOTS } from "./screenshots";
import { ShotFrame } from "./ShotFrame";
import { StageRamp } from "./StageRamp";

const S = STRINGS.landing.hero;

export function HeroSection({ release }: { release: ReleaseFacts | null }): ReactNode {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-4xl px-6 pt-20 text-center">
        <ReleaseLine release={release} />
        <h1 className="landing-rise landing-rise-1 mx-auto mt-6 max-w-3xl text-balance text-5xl font-semibold tracking-[-0.035em] sm:text-6xl">
          {S.title}
        </h1>
        <p className="landing-rise landing-rise-2 mt-5 text-balance text-xl font-medium tracking-tight text-link">
          {S.tagline}
        </p>
        <p className="landing-rise landing-rise-2 mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
          {S.subtitle}
        </p>
        <div className="landing-rise landing-rise-3 mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href={S.ctaHref} target="_blank" rel="noreferrer" className={CTA_PRIMARY}>
            {S.cta}
          </a>
          <a href={S.installHref} className={CTA_SECONDARY}>
            {S.installCta}
          </a>
        </div>
        <p className="landing-rise landing-rise-3 mt-4 text-sm text-muted-foreground">{S.note}</p>
      </div>
      <div className="landing-rise landing-rise-4 relative mt-14">
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-1/3 border-t bg-brand-tint" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20">
          <StageRamp />
          <ShotFrame shot={SCREENSHOTS.pipeline} alt={S.shotAlt} priority wide />
        </div>
      </div>
    </section>
  );
}
