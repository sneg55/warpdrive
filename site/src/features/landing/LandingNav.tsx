"use client";
import { Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { CTA_PRIMARY_SM } from "./ctaClasses";
import { useGitHubStars } from "./useGitHubStars";

const S = STRINGS.landing.nav;
const HERO = STRINGS.landing.hero;

const compactStars = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// Client component: the star count is fetched in the browser (the site is a static export with no
// server), so the nav owns that request rather than receiving a server-rendered prop.
export function LandingNav(): ReactNode {
  const githubStars = useGitHubStars(HERO.ctaHref);

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-sm transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Image
            src="/icon.png"
            alt={S.logoAlt}
            width={32}
            height={32}
            priority
            className="img-outline rounded-[8px]"
          />
          <span className="text-base font-semibold">{STRINGS.app.name}</span>
        </Link>
        <nav className="flex items-center gap-6">
          <a
            href="#features"
            className="hidden rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:inline"
          >
            {S.features}
          </a>
          <a
            href="#tour"
            className="hidden rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:inline"
          >
            {S.tour}
          </a>
          <a
            href="#compare"
            className="hidden rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:inline"
          >
            {S.compare}
          </a>
          <a
            href={HERO.ctaHref}
            target="_blank"
            rel="noreferrer"
            className={`${CTA_PRIMARY_SM} gap-1.5`}
          >
            {S.github}
            {githubStars !== null && (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-current" aria-hidden="true" />
                {compactStars.format(githubStars)}
                <span className="sr-only">{S.githubStarsSuffix}</span>
              </span>
            )}
          </a>
        </nav>
      </div>
    </header>
  );
}
