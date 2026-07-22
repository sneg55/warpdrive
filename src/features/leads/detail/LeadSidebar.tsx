"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { isSourceChannelKey, SOURCE_CHANNELS } from "@/constants/sourceChannels";
import { STRINGS } from "@/constants/strings";
import type { Organization, Person } from "@/db/schema";
import { CollapsibleSection } from "@/features/deal-workspace/CollapsibleSection";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import { OrganizationSection } from "@/features/deal-workspace/sidebar/OrganizationSection";
import { PersonSection } from "@/features/deal-workspace/sidebar/PersonSection";
import { sectionHeaderActions } from "@/features/deal-workspace/sidebar/sectionActions";
import type { CustomFieldDef } from "@/types/customFields";
import type { LeadDetail } from "../leadRepo";
import { LeadLabelRow } from "./LeadLabelRow";
import { LeadSummaryEditPanel } from "./LeadSummaryEditPanel";

const NONE: ReadonlySet<string> = new Set();

// Lead detail sidebar (mirrors DealSidebar but reads a LeadDetail; deal-specific stage fields are
// dropped). Summary's Value/Owner/Expected-close rows are the click-to-edit LeadSummaryEditPanel
// (Wave 2 parity with the deal workspace); owners is the assignable-users list for the Owner
// picker. The Person/Organization sections reuse the deal sidebar's PersonBlock/OrgBlock so the
// lead surfaces the linked contact's full field set (email/phone, website/firmographics/address),
// matching Pipedrive's lead page rather than showing name alone. person/org are the fully-loaded
// records (null when unlinked or soft-deleted); hidden*Fields are the Settings > Data fields
// built-in hides, threaded through so the lead drops the same rows the contact detail pages do.
export function LeadSidebar({
  lead,
  owners,
  person,
  org,
  hiddenPersonFields = NONE,
  hiddenOrgFields = NONE,
  personCustomFieldDefs = [],
  organizationCustomFieldDefs = [],
  baseCurrency = "USD",
}: {
  lead: LeadDetail;
  owners: { id: string; name: string; avatarUrl?: string | null }[];
  person: Person | null;
  org: Organization | null;
  hiddenPersonFields?: ReadonlySet<string>;
  hiddenOrgFields?: ReadonlySet<string>;
  personCustomFieldDefs?: CustomFieldDef[];
  organizationCustomFieldDefs?: CustomFieldDef[];
  baseCurrency?: string;
}): React.ReactNode {
  const router = useRouter();
  const [personBulkEditing, setPersonBulkEditing] = useState(false);
  const [organizationBulkEditing, setOrganizationBulkEditing] = useState(false);
  const channelName =
    lead.sourceChannel !== null && isSourceChannelKey(lead.sourceChannel)
      ? SOURCE_CHANNELS[lead.sourceChannel].name
      : (lead.sourceChannel ?? "-");

  // Leads have no dedicated custom-field target: they reuse the deal domain (a lead converts to a
  // deal), so the "Customize fields" kebab item points at deal fields, with the Person/Organization
  // sections pointing at their own entities.
  const fieldsItem = (entity: "deal" | "person" | "organization") => [
    {
      label: STRINGS.dealSidebar.menu.customizeFields,
      onSelect: () => router.push(`/settings/fields?entity=${entity}`),
    },
  ];

  return (
    <aside className="min-w-0 space-y-2">
      <CollapsibleSection
        title="Summary"
        headerActions={sectionHeaderActions("Summary", fieldsItem("deal"))}
      >
        <LeadSummaryEditPanel
          lead={{
            id: lead.id,
            updatedAt: lead.updatedAt,
            value: lead.value,
            ownerId: lead.ownerId,
            ownerName: lead.ownerName,
            expectedCloseDate: lead.expectedCloseDate,
          }}
          owners={owners}
        />
        <FieldRow label="Labels">
          <LeadLabelRow
            leadId={lead.id}
            expectedUpdatedAt={new Date(lead.updatedAt).toISOString()}
            labels={lead.labels}
          />
        </FieldRow>
      </CollapsibleSection>

      <CollapsibleSection
        title="Source"
        headerActions={sectionHeaderActions("Source", fieldsItem("deal"))}
      >
        <FieldRow label="Origin">{lead.sourceOrigin.replace(/_/g, " ")}</FieldRow>
        <FieldRow label="Channel" empty={lead.sourceChannel === null}>
          {channelName}
        </FieldRow>
        <FieldRow label="Channel ID" empty={lead.sourceChannelId === null}>
          {lead.sourceChannelId ?? "-"}
        </FieldRow>
      </CollapsibleSection>

      {person !== null && (
        <PersonSection
          person={person}
          menuItems={fieldsItem("person")}
          bulkEditing={personBulkEditing}
          onStartBulk={() => setPersonBulkEditing(true)}
          onExitBulk={() => setPersonBulkEditing(false)}
          hidden={hiddenPersonFields}
          customFieldDefs={personCustomFieldDefs}
          currency={baseCurrency}
          showLabels
        />
      )}

      {org !== null && (
        <OrganizationSection
          org={org}
          menuItems={fieldsItem("organization")}
          bulkEditing={organizationBulkEditing}
          onStartBulk={() => setOrganizationBulkEditing(true)}
          onExitBulk={() => setOrganizationBulkEditing(false)}
          hidden={hiddenOrgFields}
          customFieldDefs={organizationCustomFieldDefs}
          currency={baseCurrency}
          showLabels
        />
      )}

      <CollapsibleSection
        title="Overview"
        headerActions={sectionHeaderActions("Overview", fieldsItem("deal"))}
      >
        <FieldRow label="Created">{lead.createdAt.toLocaleDateString()}</FieldRow>
      </CollapsibleSection>
    </aside>
  );
}
