import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import pipelineShot from "./assets/pipeline.png";
import { CTA_PRIMARY } from "./ctaClasses";
import { ShotFrame } from "./ShotFrame";

const S = STRINGS.landing.hero;

export function HeroSection(): ReactNode {
  return (
    <section className="relative overflow-hidden">
      {/* Faint engineering grid behind the hero, faded out by the mask. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_20%,transparent_100%)]"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-24 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="landing-rise inline-flex rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {S.badge}
          </p>
          <h1 className="landing-rise landing-rise-1 mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {S.title}
          </h1>
          <p className="landing-rise landing-rise-2 mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
            {S.subtitle}
          </p>
          <div className="landing-rise landing-rise-3 mt-8 flex flex-wrap items-center gap-3">
            <a href={S.ctaHref} target="_blank" rel="noreferrer" className={CTA_PRIMARY}>
              {S.cta}
            </a>
          </div>
          <p className="landing-rise landing-rise-4 mt-4 text-sm text-muted-foreground">{S.note}</p>
        </div>
        <div className="landing-rise landing-rise-2">
          <ShotFrame src={pipelineShot} alt={S.shotAlt} priority />
        </div>
      </div>
    </section>
  );
}
