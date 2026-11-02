import type { ReactNode } from "react";
import { buildStructuredData } from "@/constants/structuredData";
import type { RepoFacts } from "@/types/repoFacts";
import { ComparisonSection } from "./ComparisonSection";
import { FaqSection } from "./FaqSection";
import { FeaturesSection } from "./FeaturesSection";
import { HeroSection } from "./HeroSection";
import { SelfHostSection } from "./SelfHostSection";
import { SiteShell } from "./SiteShell";
import { TourSection } from "./TourSection";

export function LandingPage({ facts }: { facts: RepoFacts }): ReactNode {
  return (
    <SiteShell initialStars={facts.stars} structuredData={buildStructuredData(facts.release)}>
      <HeroSection release={facts.release} />
      <FeaturesSection />
      <TourSection />
      <ComparisonSection />
      <SelfHostSection />
      <FaqSection />
    </SiteShell>
  );
}
