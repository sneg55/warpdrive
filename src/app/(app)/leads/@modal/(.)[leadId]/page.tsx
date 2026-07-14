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
    // Wider than the default person/org drawer: PD's lead slide-over is ~75vw and its two-column
    // overview (detail sidebar + activity timeline) needs the room.
    <DetailDrawer
      title="Lead details"
      contentClassName="w-full sm:w-[94vw] md:w-[85vw] lg:w-[80vw] xl:w-[75vw] max-w-[1280px]"
    >
      <Suspense fallback={<DetailDrawerSkeleton />}>
        <LeadDetailView leadId={leadId} />
      </Suspense>
    </DetailDrawer>
  );
}
