import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { CTA_PRIMARY } from "./ctaClasses";

const S = STRINGS.landing.footer;
const HERO = STRINGS.landing.hero;

export function LandingFooter(): ReactNode {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight">{S.heading}</h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">{S.sub}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href={HERO.ctaHref} target="_blank" rel="noreferrer" className={CTA_PRIMARY}>
            {HERO.cta}
          </a>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{STRINGS.app.name}</span>
          <span>{S.bottom}</span>
        </div>
      </div>
    </footer>
  );
}
