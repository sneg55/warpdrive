import { notFound, redirect } from "next/navigation";
import type React from "react";
import { db } from "@/db/client";
import { getLeadById } from "@/features/leads/leadRepo";
import { createContext } from "@/server/trpc/context";
import type { DealVisibilitySession } from "@/types/session";
import { LeadWorkspaceClient } from "./LeadWorkspaceClient";

// The lead read uses the same visibility session shape as the deal reads (leadVisibilityClause).
function toSession(actor: {
  id: string;
  type: string;
  isActive: boolean;
  groupIds: ReadonlySet<string>;
  managedUserIds?: ReadonlySet<string>;
}): DealVisibilitySession {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

// Shared lead-detail loader. Exported so both the full page ([leadId]/page.tsx) and the intercepted
// slide-over drawer (@modal/(.)[leadId]/page.tsx) render identical content, and generateMetadata can
// reuse the load. Mirrors PersonDetailView / OrgDetailView.
export async function loadLead(leadId: string) {
  const ctx = await createContext();
  if (ctx.actor === null) return { kind: "unauth" as const };
  const lead = await getLeadById(db, toSession(ctx.actor), leadId, AbortSignal.timeout(10_000));
  if (lead === null) return { kind: "notfound" as const };
  return { kind: "ok" as const, lead };
}

export async function LeadDetailView({ leadId }: { leadId: string }): Promise<React.ReactNode> {
  const loaded = await loadLead(leadId);
  if (loaded.kind === "unauth") redirect("/login");
  if (loaded.kind === "notfound") notFound();

  return (
    <main aria-label="Lead" className="h-full">
      <LeadWorkspaceClient lead={loaded.lead} />
    </main>
  );
}
