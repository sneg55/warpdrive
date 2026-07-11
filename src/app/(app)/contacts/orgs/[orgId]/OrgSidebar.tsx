"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { CONTACT_SIDEBAR_STRINGS } from "@/constants/contactSidebarStrings";
import { STRINGS } from "@/constants/strings";
import { OrgSummaryEditPanel } from "@/features/contacts/OrgSummaryEditPanel";
import type { OrgDetail } from "@/features/contacts/orgsRepo";
import { CustomFieldDetail } from "@/features/custom-fields/render";
import { CollapsibleSection } from "@/features/deal-workspace/CollapsibleSection";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import type { CustomFieldDef } from "@/types/customFields";
import { ContactOverviewSection } from "../../ContactOverviewSection";
import { CustomFieldsPanel } from "../../contactDetail.shared";
import { contactSectionActions, customizeFieldsItem } from "../../contactSectionMenu";
import { OrgFirmographicsPanel } from "./OrgFirmographicsPanel";
import { RelatedOrgsPanel } from "./RelatedOrgsPanel";

const sections = CONTACT_SIDEBAR_STRINGS.sections;

type RelatedOrg = React.ComponentProps<typeof RelatedOrgsPanel>["related"];

// Org detail sidebar (CO-2): Summary / Details / Related organizations / Stats are collapsible
// sections with the shared section header menu (pencil reveals empty fields), matching the deal
// sidebar. Stats keeps the Open-deals count; the activity Overview widget renders below it (PD
// shows Overview on org detail as well as person).
export function OrgSidebar({
  org,
  defs,
  hiddenBuiltins = new Set(),
  baseCurrency,
  relatedOrgs,
  orgOptions,
  openDealsCount,
  onRelatedChanged,
}: {
  org: OrgDetail;
  defs: CustomFieldDef[];
  hiddenBuiltins?: ReadonlySet<string>;
  baseCurrency: string;
  relatedOrgs: RelatedOrg;
  orgOptions: { id: string; name: string }[];
  openDealsCount: number;
  onRelatedChanged: () => void;
}): React.ReactNode {
  const router = useRouter();
  const push = (href: string): void => router.push(href);
  const orgFieldsItem = customizeFieldsItem(
    push,
    "organization",
    STRINGS.dealSidebar.menu.customizeFields,
  );

  return (
    <aside className="space-y-2 min-w-0 lg:order-first">
      <CollapsibleSection
        title={sections.summary}
        headerActions={contactSectionActions(sections.summary, [orgFieldsItem])}
      >
        <OrgSummaryEditPanel org={org} hidden={hiddenBuiltins} />
      </CollapsibleSection>

      <CollapsibleSection
        title={sections.details}
        headerActions={contactSectionActions(sections.details, [orgFieldsItem])}
      >
        <OrgFirmographicsPanel org={org} hidden={hiddenBuiltins} onSaved={() => router.refresh()} />
      </CollapsibleSection>

      <CollapsibleSection title={sections.relatedOrgs}>
        <RelatedOrgsPanel
          orgId={org.id}
          related={relatedOrgs}
          orgOptions={orgOptions}
          onChanged={onRelatedChanged}
        />
      </CollapsibleSection>

      <CustomFieldsPanel
        defs={defs}
        values={org.customFields as Record<string, unknown>}
        renderValue={(def, value) => (
          <CustomFieldDetail def={def} value={value} currency={baseCurrency} />
        )}
      />

      <CollapsibleSection title={sections.stats}>
        <FieldRow label="Open deals">
          <span className="tabular-nums">{openDealsCount}</span>
        </FieldRow>
      </CollapsibleSection>

      {/* CO-2 / spec B2: PD shows an activity Overview on org detail too, not just person. */}
      <ContactOverviewSection entityType="organization" entityId={org.id} />
    </aside>
  );
}
