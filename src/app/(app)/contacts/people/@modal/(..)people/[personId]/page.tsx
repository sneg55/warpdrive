import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { PersonDetailView } from "../../../[personId]/PersonDetailView";

export default async function InterceptedPersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}): Promise<React.ReactNode> {
  const { personId } = await params;
  return (
    <DetailDrawer title="Person details">
      <Suspense fallback={<DetailDrawerPreviewSkeleton recordId={personId} />}>
        <PersonDetailView personId={personId} />
      </Suspense>
    </DetailDrawer>
  );
}
