import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { PersonDetailView } from "../../../[personId]/PersonDetailView";

// Intercepted person detail: when a row is clicked from the People list (client nav), Next renders
// this in the `modal` slot as a slide-over instead of replacing the list. The named parent matcher
// avoids Turbopack's repeated-interceptor failure for adjacent `(.)[dynamicId]` route markers.
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
