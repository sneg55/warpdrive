import type React from "react";
import { Suspense } from "react";
import { DetailDrawer } from "@/features/navigation/DetailDrawer";
import { DetailDrawerPreviewSkeleton } from "@/features/navigation/DetailDrawerPreviewSkeleton";
import { OrgDetailView } from "../../../../../contacts/orgs/[orgId]/OrgDetailView";

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
