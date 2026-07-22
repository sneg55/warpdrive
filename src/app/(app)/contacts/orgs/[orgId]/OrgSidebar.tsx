"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { CONTACT_SIDEBAR_STRINGS } from "@/constants/contactSidebarStrings";
import type { DealStatus } from "@/constants/dealStatus";
import { STRINGS } from "@/constants/strings";
import type { OrgDetail } from "@/features/contacts/orgsRepo";
import { CollapsibleSection } from "@/features/deal-workspace/CollapsibleSection";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import { OrganizationSection } from "@/features/deal-workspace/sidebar/OrganizationSection";
import type { CustomFieldDef } from "@/types/customFields";
import { ContactOverviewSection } from "../../ContactOverviewSection";
import { ListPanel } from "../../contactDetail.shared";
import { customizeFieldsItem } from "../../contactSectionMenu";
import { LinkedDealRow } from "../../LinkedDealRow";
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
  people,
  deals,
  onRelatedChanged,
}: {
  org: OrgDetail;
  defs: CustomFieldDef[];
  hiddenBuiltins?: ReadonlySet<string>;
  baseCurrency: string;
  relatedOrgs: RelatedOrg;
  orgOptions: { id: string; name: string }[];
  openDealsCount: number;
  people: { id: string; name: string }[];
  deals: { id: string; title: string; status: DealStatus }[];
  onRelatedChanged: () => void;
}): React.ReactNode {
  const router = useRouter();
  const [organizationBulkEditing, setOrganizationBulkEditing] = useState(false);
  const push = (href: string): void => router.push(href);
  const orgFieldsItem = customizeFieldsItem(
    push,
    "organization",
    STRINGS.dealSidebar.menu.customizeFields,
  );

  return (
    <aside className="space-y-2 min-w-0 lg:order-first">
      <OrganizationSection
        org={org}
        menuItems={[orgFieldsItem]}
        bulkEditing={organizationBulkEditing}
        onStartBulk={() => setOrganizationBulkEditing(true)}
        onExitBulk={() => setOrganizationBulkEditing(false)}
        hidden={hiddenBuiltins}
        customFieldDefs={defs}
        currency={baseCurrency}
      />

      <CollapsibleSection title={sections.relatedOrgs}>
        <RelatedOrgsPanel
          orgId={org.id}
          related={relatedOrgs}
          orgOptions={orgOptions}
          onChanged={onRelatedChanged}
        />
      </CollapsibleSection>

      <CollapsibleSection title={sections.stats}>
        <FieldRow label="Open deals">
          <span className="tabular-nums">{openDealsCount}</span>
        </FieldRow>
      </CollapsibleSection>

      {/* CO-2 / spec B2: PD shows an activity Overview on org detail too, not just person. */}
      <ContactOverviewSection entityType="organization" entityId={org.id} />

      <CollapsibleSection title={sections.people}>
        <ListPanel
          items={people}
          empty="No people yet."
          render={(person) => (
            <li key={person.id}>
              <Link
                href={`/contacts/people/${person.id}`}
                className="block rounded px-1 py-1 text-sm text-primary transition-colors duration-150 hover:bg-accent hover:underline motion-reduce:transition-none"
              >
                {person.name}
              </Link>
            </li>
          )}
        />
      </CollapsibleSection>

      <CollapsibleSection title={sections.deals}>
        <ListPanel
          items={deals}
          empty="No deals yet."
          render={(deal) => <LinkedDealRow key={deal.id} deal={deal} />}
        />
      </CollapsibleSection>
    </aside>
  );
}
