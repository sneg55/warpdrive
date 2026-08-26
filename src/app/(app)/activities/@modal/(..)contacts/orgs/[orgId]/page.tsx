import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { OrgDetailView } from "../../../../../contacts/orgs/[orgId]/OrgDetailView";

// Last rung of the fallback: an activity with neither a deal nor a person opens its organization.
// Needs its own interceptor here for the same reason the person one does.
export default async function InterceptedOrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}): Promise<React.ReactNode> {
  const { orgId } = await params;
  return (
    <DetailDrawer title="Organization details">
      <Suspense fallback={<DetailDrawerPreviewSkeleton recordId={orgId} />}>
        <OrgDetailView orgId={orgId} />
      </Suspense>
    </DetailDrawer>
  );
}
