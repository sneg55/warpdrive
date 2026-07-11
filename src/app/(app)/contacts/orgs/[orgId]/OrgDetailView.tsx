import { notFound, redirect } from "next/navigation";
import type React from "react";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { getContactFollowers } from "@/features/contacts/followers";
import { getOrg } from "@/features/contacts/orgsRepo";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { listHiddenBuiltins } from "@/features/custom-fields/hiddenBuiltinsRepo";
import { cachedDetailLoad } from "@/features/navigation/cachedDetailLoad";
import { can } from "@/features/permissions/can";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { OrgDetailClient } from "./OrgDetailClient";

// Shared org-detail loader. Exported so both the full page ([orgId]/page.tsx) and the intercepted
// slide-over drawer (@modal/(.)[orgId]/page.tsx) render identical content, and generateMetadata can
// reuse the cached load. Mirrors PersonDetailView.
export const loadOrg = cachedDetailLoad((ctx, actor, orgId) =>
  getOrg(ctx.db, toContactActor(actor), orgId, AbortSignal.timeout(10_000)),
);

export async function OrgDetailView({ orgId }: { orgId: string }): Promise<React.ReactNode> {
  const loaded = await loadOrg(orgId);
  if (loaded.kind === "unauth") {
    redirect("/login");
  }
  if (loaded.kind === "notfound") {
    notFound();
  }
  const { ctx, actor, value: org } = loaded;

  // All three reads need only the already-loaded org, so they are issued together.
  const [defs, baseCurrency, { followers, isFollowedBySelf }, hidden] = await Promise.all([
    listDefs(ctx.db, "organization", {}, AbortSignal.timeout(10_000)),
    readBaseCurrency(ctx.db, AbortSignal.timeout(8000)),
    getContactFollowers(ctx.db, actor, "organization", org.id, AbortSignal.timeout(10_000)),
    listHiddenBuiltins(ctx.db, AbortSignal.timeout(10_000)),
  ]);

  const record: VisiblePersonOrOrg = {
    kind: "organization",
    ownerId: org.ownerId,
    visibilityLevel: org.visibilityLevel,
    visibilityGroupId: org.visibilityGroupId,
    visibleToUserIds: org.visibleToUserIds,
  };
  const canMerge = can(actor, "contact.merge", record);
  const canDelete = can(actor, "contact.delete", record);

  return (
    <OrgDetailClient
      org={org}
      defs={defs}
      hiddenBuiltins={hidden.organization}
      canMerge={canMerge}
      canDelete={canDelete}
      baseCurrency={baseCurrency}
      followers={followers}
      isFollowedBySelf={isFollowedBySelf}
    />
  );
}
