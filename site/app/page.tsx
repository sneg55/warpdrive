import type { ReactNode } from "react";
import { getBuildRepoFacts } from "@/features/release/buildRepoFacts";
import { LandingPage } from "@/features/landing/LandingPage";

export const dynamic = "force-static";

export default async function Page(): Promise<ReactNode> {
  return <LandingPage facts={await getBuildRepoFacts()} />;
}
