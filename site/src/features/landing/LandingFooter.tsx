import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { CTA_PRIMARY, CTA_SECONDARY } from "./ctaClasses";
import { StageRamp } from "./StageRamp";

const S = STRINGS.landing.footer;
const HERO = STRINGS.landing.hero;

const LINK =
  "rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function LandingFooter(): ReactNode {
  return (
    <footer className="border-t">
      <div className="bg-brand-tint">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="mx-auto max-w-xs">
            <StageRamp />
          </div>
          <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight">{S.heading}</h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-foreground/75">{S.sub}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={HERO.ctaHref} target="_blank" rel="noreferrer" className={CTA_PRIMARY}>
              {HERO.cta}
            </a>
            <a href={HERO.installHref} className={CTA_SECONDARY}>
              {HERO.installCta}
            </a>
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-[2fr_1fr]">
        {S.groups.map((group) => (
          <nav key={group.label} aria-label={group.label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul
              className={`mt-4 grid gap-x-8 gap-y-2.5 ${group.links.length > 4 ? "sm:grid-cols-2" : ""}`}
            >
              {group.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={LINK}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
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
