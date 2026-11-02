import type { Metadata } from "next";
import type { ReactNode } from "react";
import { COMPETITORS, type CompetitorSlug } from "@/constants/competitors";
import { pageMetadata } from "@/constants/siteMetadata";
import { CompetitorPage } from "@/features/compare/CompetitorPage";
import { getBuildRepoFacts } from "@/features/release/buildRepoFacts";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = Promise<{ competitor: CompetitorSlug }>;

export function generateStaticParams(): Array<{ competitor: CompetitorSlug }> {
  return Object.values(COMPETITORS).map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { competitor } = await params;
  return pageMetadata(COMPETITORS[competitor].page);
}

export default async function Page({ params }: { params: Params }): Promise<ReactNode> {
  const { competitor } = await params;
  const facts = await getBuildRepoFacts();
  return <CompetitorPage competitor={COMPETITORS[competitor]} initialStars={facts.stars} />;
}
