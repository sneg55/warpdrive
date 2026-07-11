import type { Metadata } from "next";
import type React from "react";
import { STRINGS } from "@/constants/strings";
import { entityTitle } from "@/features/navigation/pageTitle";
import { loadPerson, PersonDetailView } from "./PersonDetailView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ personId: string }>;
}): Promise<Metadata> {
  const { personId } = await params;
  const loaded = await loadPerson(personId);
  const name = loaded.kind === "ok" ? loaded.value.name : null;
  return { title: entityTitle(name, STRINGS.titles.personFallback) };
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}): Promise<React.ReactNode> {
  const { personId } = await params;
  return <PersonDetailView personId={personId} />;
}
