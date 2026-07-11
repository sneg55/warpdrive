import type React from "react";
import { Suspense } from "react";
import { DetailDrawerSkeleton } from "@/components/shell/skeletons";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { PersonDetailView } from "../../[personId]/PersonDetailView";

// Intercepted person detail: when a row is clicked from the People list (client nav), Next renders
// this in the `modal` slot as a slide-over instead of replacing the list. The URL still updates to
// /contacts/people/[personId], so the record stays deep-linkable (a hard load hits the full page).
export default async function InterceptedPersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}): Promise<React.ReactNode> {
  const { personId } = await params;
  return (
    <DetailDrawer title="Person details">
      <Suspense fallback={<DetailDrawerSkeleton />}>
        <PersonDetailView personId={personId} />
      </Suspense>
    </DetailDrawer>
  );
}
