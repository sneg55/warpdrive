import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { ComparisonSection } from "./ComparisonSection";
import { FaqSection } from "./FaqSection";
import { FeaturesSection } from "./FeaturesSection";
import { HeroSection } from "./HeroSection";
import { JsonLd } from "./JsonLd";
import { LandingFooter } from "./LandingFooter";
import { LandingNav } from "./LandingNav";
import { SelfHostSection } from "./SelfHostSection";
import { TourSection } from "./TourSection";

// Marketing surface for the static site. Server-rendered apart from the client islands (nav star
// badge, ShotFrame lightbox, scroll reveals, terminal typing). No request-time data: it prerenders
// fully and works with no backend, which is what `output: 'export'` needs.
export function LandingPage(): ReactNode {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <JsonLd />
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        {STRINGS.landing.nav.skipToContent}
      </a>
      <LandingNav />
      <main id="main">
        <HeroSection />
        <FeaturesSection />
        <TourSection />
        <ComparisonSection />
        <SelfHostSection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
