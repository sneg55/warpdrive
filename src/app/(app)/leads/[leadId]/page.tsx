import type { Metadata } from "next";
import type React from "react";
import { STRINGS } from "@/constants/strings";
import { entityTitle } from "@/features/navigation/pageTitle";
import { LeadDetailView, loadLead } from "./LeadDetailView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ leadId: string }>;
}): Promise<Metadata> {
  const { leadId } = await params;
  const loaded = await loadLead(leadId);
  const name = loaded.kind === "ok" ? loaded.lead.title : null;
  return { title: entityTitle(name, STRINGS.titles.leadFallback) };
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}): Promise<React.ReactNode> {
  const { leadId } = await params;
  return <LeadDetailView leadId={leadId} />;
}
