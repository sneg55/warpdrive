import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { LeadDetailView } from "../../../[leadId]/LeadDetailView";

// Intercepted lead detail: a row click from the Leads inbox opens this as a slide-over over the
// list; the URL still updates to /leads/[leadId] so a hard load renders the full page. The matcher
// steps up and names `leads` again instead of using `(.)[leadId]`, which avoids Turbopack treating
// the adjacent interceptor and dynamic-segment markers as one repeatedly expanded route.
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
