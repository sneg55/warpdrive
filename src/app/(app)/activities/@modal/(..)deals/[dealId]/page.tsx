import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { DealDetailView } from "../../../../deals/[dealId]/DealDetailView";

export default async function InterceptedDealPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}): Promise<React.ReactNode> {
  const { dealId } = await params;
  return (
    <DetailDrawer
      title="Deal details"
      contentClassName="w-full sm:w-[96vw] md:w-[92vw] lg:w-[88vw] xl:w-[84vw] max-w-[1600px]"
    >
      <Suspense fallback={<DetailDrawerPreviewSkeleton recordId={dealId} />}>
        <DealDetailView dealId={dealId} />
      </Suspense>
    </DetailDrawer>
  );
}
