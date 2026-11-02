import type { ReactNode } from "react";
import { pageMetadata } from "@/constants/siteMetadata";
import { MIGRATION_PAGE } from "@/constants/sitePages";
import { MigrationPage } from "@/features/migrate/MigrationPage";
import { getBuildRepoFacts } from "@/features/release/buildRepoFacts";

export const dynamic = "force-static";

export const metadata = pageMetadata(MIGRATION_PAGE);

export default async function Page(): Promise<ReactNode> {
  const facts = await getBuildRepoFacts();
  return <MigrationPage initialStars={facts.stars} />;
}
