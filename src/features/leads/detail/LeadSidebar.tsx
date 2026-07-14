"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { isSourceChannelKey, SOURCE_CHANNELS } from "@/constants/sourceChannels";
import { STRINGS } from "@/constants/strings";
import type { Organization, Person } from "@/db/schema";
import { CollapsibleSection } from "@/features/deal-workspace/CollapsibleSection";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import { OrgBlock } from "@/features/deal-workspace/sidebar/OrgBlock";
import { PersonBlock } from "@/features/deal-workspace/sidebar/PersonBlock";
import { sectionHeaderActions } from "@/features/deal-workspace/sidebar/sectionActions";
import { useLabelChipResolver } from "@/features/labels/useLabelChipResolver";
import type { LeadDetail } from "../leadRepo";
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
}: {
  lead: LeadDetail;
  owners: { id: string; name: string; avatarUrl?: string | null }[];
  person: Person | null;
  org: Organization | null;
  hiddenPersonFields?: ReadonlySet<string>;
  hiddenOrgFields?: ReadonlySet<string>;
}): React.ReactNode {
  const router = useRouter();
  const resolveLabels = useLabelChipResolver("lead");
  const resolvePersonLabels = useLabelChipResolver("person");
  const resolveOrgLabels = useLabelChipResolver("organization");
  const labels = resolveLabels(lead.labels);
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
        <FieldRow label="Labels" empty={labels.length === 0}>
          {labels.length > 0 ? (
            <span className="flex flex-wrap justify-end gap-1">
              {labels.map((label) => (
                <span
                  key={label.name}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${label.classes}`}
                >
                  {label.name}
                </span>
              ))}
            </span>
          ) : (
            "-"
          )}
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
        <CollapsibleSection
          title="Person"
          headerActions={sectionHeaderActions("Person", fieldsItem("person"))}
        >
          <PersonBlock
            person={person}
            hidden={hiddenPersonFields}
            hideNameParts
            labels={resolvePersonLabels(person.labels)}
          />
        </CollapsibleSection>
      )}

      {org !== null && (
        <CollapsibleSection
          title="Organization"
          headerActions={sectionHeaderActions("Organization", fieldsItem("organization"))}
        >
          <OrgBlock org={org} hidden={hiddenOrgFields} labels={resolveOrgLabels(org.labels)} />
        </CollapsibleSection>
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
