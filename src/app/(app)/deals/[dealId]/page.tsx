import type { Metadata } from "next";
import type React from "react";
import { STRINGS } from "@/constants/strings";
import { entityTitle } from "@/features/navigation/pageTitle";
import { DealDetailView, loadDeal } from "./DealDetailView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dealId: string }>;
}): Promise<Metadata> {
  const { dealId } = await params;
  const loaded = await loadDeal(dealId);
  const name = loaded.kind === "ok" ? loaded.value.deal.title : null;
  return { title: entityTitle(name, STRINGS.titles.dealFallback) };
}

export default async function DealPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}): Promise<React.ReactNode> {
  const { dealId } = await params;
  return <DealDetailView dealId={dealId} />;
}
