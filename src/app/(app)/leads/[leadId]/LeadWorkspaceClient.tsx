"use client";
import type React from "react";
import { useMemo } from "react";
import type { Organization, Person } from "@/db/schema";
import { useMarketingCampaigns } from "@/features/brevo/useMarketingCampaigns";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import { mergeMarketingItems, mergeSupportItems } from "@/features/deal-workspace/historyTimeline";
import { useSupportConversations } from "@/features/intercom/useSupportConversations";
import { LeadHeader } from "@/features/leads/detail/LeadHeader";
import { LeadSidebar } from "@/features/leads/detail/LeadSidebar";
import { LeadTimeline } from "@/features/leads/detail/LeadTimeline";
import type { LeadDetail } from "@/features/leads/leadRepo";
import type { LeadTimelineResult } from "@/features/leads/leadTimeline";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";

const EMPTY_TIMELINE: LeadTimelineResult = { items: [], emails: [] };

export interface LeadWorkspaceClientProps {
  lead: LeadDetail;
  person: Person | null;
  org: Organization | null;
  hiddenPersonFields: ReadonlySet<string>;
  hiddenOrgFields: ReadonlySet<string>;
  personCustomFieldDefs?: CustomFieldDef[];
  organizationCustomFieldDefs?: CustomFieldDef[];
  leadCustomFieldDefs?: CustomFieldDef[];
  baseCurrency: string;
}

export function LeadWorkspaceClient({
  lead,
  person,
  org,
  hiddenPersonFields,
  hiddenOrgFields,
  personCustomFieldDefs = [],
  organizationCustomFieldDefs = [],
  leadCustomFieldDefs = [],
  baseCurrency,
}: LeadWorkspaceClientProps): React.ReactNode {
  const timelineQ = trpc.lead.leadTimeline.useQuery({ leadId: lead.id });
  const timeline = timelineQ.data ?? EMPTY_TIMELINE;
  const supportScope = useMemo(() => ({ kind: "lead" as const, leadId: lead.id }), [lead.id]);
  const support = useSupportConversations(supportScope);
  const marketing = useMarketingCampaigns(supportScope);
  const items = useMemo(
    () =>
      mergeMarketingItems(
        mergeSupportItems(timeline.items, support, supportScope),
        marketing,
        supportScope,
      ),
    [timeline.items, support, marketing, supportScope],
  );
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
          leadCustomFieldDefs={leadCustomFieldDefs}
          baseCurrency={baseCurrency}
        />
        <div className="min-w-0">
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
            items={items}
            emails={timeline.emails}
            onNoteChanged={() => void timelineQ.refetch()}
          />
        </div>
      </div>
    </div>
  );
}
