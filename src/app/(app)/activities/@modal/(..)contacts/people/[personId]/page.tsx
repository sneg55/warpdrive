import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { PersonDetailView } from "../../../../../contacts/people/[personId]/PersonDetailView";

// An activity with no deal falls back to the contact it hangs off, so the Activities list needs its
// own interceptor for the person route: the People list's @modal slot only intercepts navigations
// that start inside /contacts/people.
export default async function InterceptedPersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}): Promise<React.ReactNode> {
  const { personId } = await params;
  return (
    <DetailDrawer title="Contact details">
      <Suspense fallback={<DetailDrawerPreviewSkeleton recordId={personId} />}>
        <PersonDetailView personId={personId} />
      </Suspense>
    </DetailDrawer>
  );
}
