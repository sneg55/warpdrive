"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { CONTACT_SIDEBAR_STRINGS } from "@/constants/contactSidebarStrings";
import { STRINGS } from "@/constants/strings";
import type { PersonDetail } from "@/features/contacts/personsRepo";
import { CollapsibleSection } from "@/features/deal-workspace/CollapsibleSection";
import { PersonSection } from "@/features/deal-workspace/sidebar/PersonSection";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { ContactOverviewSection } from "../../ContactOverviewSection";
import { ListPanel } from "../../contactDetail.shared";
import { customizeFieldsItem } from "../../contactSectionMenu";
import { LinkedDealRow } from "../../LinkedDealRow";

const sections = CONTACT_SIDEBAR_STRINGS.sections;

// Person detail sidebar (CO-2): the Contact block is a CollapsibleSection with the shared section
// header menu (pencil reveals empty fields, kebab customizes fields), matching the deal sidebar.
// Adds a person Overview section sourced from contacts.activityStats.
export function PersonSidebar({
  person,
  orgName,
  defs,
  hiddenBuiltins = new Set(),
  baseCurrency,
}: {
  person: PersonDetail;
  orgName: string | null;
  defs: CustomFieldDef[];
  hiddenBuiltins?: ReadonlySet<string>;
  baseCurrency: string;
}): React.ReactNode {
  const router = useRouter();
  const [personBulkEditing, setPersonBulkEditing] = useState(false);
  const deals = trpc.contacts.dealsForPerson.useQuery({ personId: person.id }).data ?? [];

  return (
    <aside className="space-y-2 min-w-0 lg:order-first">
      <PersonSection
        person={person}
        menuItems={[
          customizeFieldsItem(
            (href) => router.push(href),
            "person",
            STRINGS.dealSidebar.menu.customizeFields,
          ),
        ]}
        bulkEditing={personBulkEditing}
        onStartBulk={() => setPersonBulkEditing(true)}
        onExitBulk={() => setPersonBulkEditing(false)}
        hidden={hiddenBuiltins}
        customFieldDefs={defs}
        currency={baseCurrency}
      />

      {orgName !== null && person.orgId !== null && (
        <Link
          href={`/contacts/orgs/${person.orgId}`}
          className="block rounded px-1 py-1 text-sm text-primary transition-colors duration-150 hover:bg-accent hover:underline motion-reduce:transition-none"
        >
          View {orgName}
        </Link>
      )}

      <ContactOverviewSection entityType="person" entityId={person.id} />

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
