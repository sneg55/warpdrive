import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { JsonLd } from "./JsonLd";
import { LandingFooter } from "./LandingFooter";
import { LandingNav } from "./LandingNav";

export function SiteShell({
  initialStars,
  structuredData,
  children,
}: {
  initialStars: number | null;
  structuredData: object | null;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {structuredData !== null && <JsonLd data={structuredData} />}
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        {STRINGS.landing.nav.skipToContent}
      </a>
      <LandingNav initialStars={initialStars} />
      <main id="main">{children}</main>
      <LandingFooter />
    </div>
  );
}
