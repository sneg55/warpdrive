"use client";
import type React from "react";
import type { Organization, Person } from "@/db/schema";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import { LeadHeader } from "@/features/leads/detail/LeadHeader";
import { LeadSidebar } from "@/features/leads/detail/LeadSidebar";
import { LeadTimeline } from "@/features/leads/detail/LeadTimeline";
import type { LeadDetail } from "@/features/leads/leadRepo";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";

export interface LeadWorkspaceClientProps {
  lead: LeadDetail;
  // Fully-loaded linked contact records + Settings > Data fields hides, threaded to the sidebar's
  // Person/Organization blocks. null when the lead has no (or a soft-deleted) person/org.
  person: Person | null;
  org: Organization | null;
  hiddenPersonFields: ReadonlySet<string>;
  hiddenOrgFields: ReadonlySet<string>;
  personCustomFieldDefs?: CustomFieldDef[];
  organizationCustomFieldDefs?: CustomFieldDef[];
  baseCurrency?: string;
}

// Lead detail workspace, mirroring DealWorkspaceClient: header actions, a person/value sidebar, and
// a notes/activities/email timeline fed by the leadTimeline tRPC read.
export function LeadWorkspaceClient({
  lead,
  person,
  org,
  hiddenPersonFields,
  hiddenOrgFields,
  personCustomFieldDefs = [],
  organizationCustomFieldDefs = [],
  baseCurrency = "USD",
}: LeadWorkspaceClientProps): React.ReactNode {
  const timelineQ = trpc.lead.leadTimeline.useQuery({ leadId: lead.id });
  const timeline = timelineQ.data ?? { items: [], emails: [] };
  // Assignable users for the sidebar's Owner picker (LeadSummaryEditPanel); the write path
  // (updateLead) is the real authority (deal.changeOwner), this read is deliberately ungated.
  const ownersQ = trpc.identity.assignableUsers.useQuery();
  const owners = ownersQ.data ?? [];

  return (
    <div className="flex h-full flex-col p-4">
      <LeadHeader lead={lead} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[34fr_66fr]">
        <LeadSidebar
          lead={lead}
          owners={owners}
          person={person}
          org={org}
          hiddenPersonFields={hiddenPersonFields}
          hiddenOrgFields={hiddenOrgFields}
          personCustomFieldDefs={personCustomFieldDefs}
          organizationCustomFieldDefs={organizationCustomFieldDefs}
          baseCurrency={baseCurrency}
        />
        <div className="min-w-0">
          {/* Compose toolbar (Pipedrive): collapse-by-default Activity/Notes for the lead
              scope. Email/Files stay hidden (lead has neither a mailbox thread nor a file
              entity yet, see emailTabEnabled/fileTabEnabled in composeScope.ts). */}
          <SharedComposeBar
            scope={{
              entityType: "lead",
              entityId: lead.id,
              personId: lead.personId ?? undefined,
              orgId: lead.orgId ?? undefined,
              personName: lead.personName ?? undefined,
            }}
            emailAccountId={null}
            onActivityCreated={() => void timelineQ.refetch()}
            onNoteCreated={() => void timelineQ.refetch()}
          />
          <LeadTimeline
            items={timeline.items}
            emails={timeline.emails}
            onNoteChanged={() => void timelineQ.refetch()}
          />
        </div>
      </div>
    </div>
  );
}
