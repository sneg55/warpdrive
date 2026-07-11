import type React from "react";
import { Suspense } from "react";
import { DetailDrawerSkeleton } from "@/components/shell/skeletons";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { LeadDetailView } from "../../[leadId]/LeadDetailView";

// Intercepted lead detail: a row click from the Leads inbox opens this as a slide-over over the
// list; the URL still updates to /leads/[leadId] so a hard load renders the full page.
export default async function InterceptedLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}): Promise<React.ReactNode> {
  const { leadId } = await params;
  return (
    <DetailDrawer title="Lead details">
      <Suspense fallback={<DetailDrawerSkeleton />}>
        <LeadDetailView leadId={leadId} />
      </Suspense>
    </DetailDrawer>
  );
}
