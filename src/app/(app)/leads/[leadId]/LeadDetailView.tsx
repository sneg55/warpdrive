import { notFound, redirect } from "next/navigation";
import type React from "react";
import { db } from "@/db/client";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { listHiddenBuiltins } from "@/features/custom-fields/hiddenBuiltinsRepo";
import { getLeadById, getLeadRelations } from "@/features/leads/leadRepo";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
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

  // Load the linked person/org records and the Settings > Data fields hides so the sidebar's
  // Person/Organization blocks render the contact's full field set (PD parity), dropping the same
  // built-in rows the contact detail pages do. The lead visibility gate above is the authority.
  const signal = AbortSignal.timeout(10_000);
  const [relations, hidden, personCustomFieldDefs, organizationCustomFieldDefs, baseCurrency] =
    await Promise.all([
      getLeadRelations(db, loaded.lead, signal),
      listHiddenBuiltins(db, signal),
      listDefs(db, "person", {}, signal),
      listDefs(db, "organization", {}, signal),
      readBaseCurrency(db, signal),
    ]);

  return (
    <main aria-label="Lead" className="h-full">
      <LeadWorkspaceClient
        lead={loaded.lead}
        person={relations.person}
        org={relations.org}
        hiddenPersonFields={hidden.person}
        hiddenOrgFields={hidden.organization}
        personCustomFieldDefs={personCustomFieldDefs}
        organizationCustomFieldDefs={organizationCustomFieldDefs}
        baseCurrency={baseCurrency}
      />
    </main>
  );
}
