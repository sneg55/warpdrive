import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { LeadDetailView } from "../../../../leads/[leadId]/LeadDetailView";

// A lead is the other primary parent an activity can have (activities.lead_id, mutually exclusive
// with deal_id), so the Activities list needs its own interceptor for it: the Leads inbox's @modal
// slot only intercepts navigations that start inside /leads.
export default async function InterceptedLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}): Promise<React.ReactNode> {
  const { leadId } = await params;
  return (
    <DetailDrawer
      title="Lead details"
      contentClassName="w-full sm:w-[94vw] md:w-[85vw] lg:w-[80vw] xl:w-[75vw] max-w-[1280px]"
    >
      <Suspense fallback={<DetailDrawerPreviewSkeleton recordId={leadId} />}>
        <LeadDetailView leadId={leadId} />
      </Suspense>
    </DetailDrawer>
  );
}
