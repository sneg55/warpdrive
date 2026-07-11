"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { CONTACT_SIDEBAR_STRINGS } from "@/constants/contactSidebarStrings";
import { STRINGS } from "@/constants/strings";
import { PersonSummaryEditPanel } from "@/features/contacts/PersonSummaryEditPanel";
import type { PersonDetail } from "@/features/contacts/personsRepo";
import { CustomFieldDetail } from "@/features/custom-fields/render";
import { CollapsibleSection } from "@/features/deal-workspace/CollapsibleSection";
import type { CustomFieldDef } from "@/types/customFields";
import { ContactOverviewSection } from "../../ContactOverviewSection";
import { CustomFieldsPanel } from "../../contactDetail.shared";
import { contactSectionActions, customizeFieldsItem } from "../../contactSectionMenu";

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
  orgOptions,
}: {
  person: PersonDetail;
  orgName: string | null;
  defs: CustomFieldDef[];
  hiddenBuiltins?: ReadonlySet<string>;
  baseCurrency: string;
  orgOptions: { id: string; name: string }[];
}): React.ReactNode {
  const router = useRouter();

  return (
    <aside className="space-y-2 min-w-0 lg:order-first">
      <CollapsibleSection
        title={sections.contact}
        headerActions={contactSectionActions(sections.contact, [
          customizeFieldsItem(
            (href) => router.push(href),
            "person",
            STRINGS.dealSidebar.menu.customizeFields,
          ),
        ])}
      >
        <PersonSummaryEditPanel
          person={{
            id: person.id,
            name: person.name,
            // Normalize the stored contact-point shape (primary?: boolean) to the strict
            // primary: boolean the inline-edit save path (and updatePersonAction) expect.
            emails: person.emails.map((e) => ({ ...e, primary: e.primary === true })),
            phones: person.phones.map((p) => ({ ...p, primary: p.primary === true })),
            orgId: person.orgId,
          }}
          orgOptions={orgOptions}
          hidden={hiddenBuiltins}
        />
        {orgName !== null && person.orgId !== null && (
          <div className="mt-2 text-sm">
            <a href={`/contacts/orgs/${person.orgId}`} className="text-primary hover:underline">
              View {orgName}
            </a>
          </div>
        )}
      </CollapsibleSection>

      <CustomFieldsPanel
        defs={defs}
        values={person.customFields as Record<string, unknown>}
        renderValue={(def, value) => (
          <CustomFieldDetail def={def} value={value} currency={baseCurrency} />
        )}
      />

      <ContactOverviewSection entityType="person" entityId={person.id} />
    </aside>
  );
}
