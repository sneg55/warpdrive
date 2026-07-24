import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { OrgDetailView } from "../../../[orgId]/OrgDetailView";

// Intercepted org detail: a row click from the Organizations list opens this as a slide-over over
// the list; the URL still updates to /contacts/orgs/[orgId]. The named parent matcher avoids
// Turbopack's repeated-interceptor failure for adjacent `(.)[dynamicId]` route markers.
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
