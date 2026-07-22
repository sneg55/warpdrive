"use client";

import type React from "react";
import type { Organization } from "@/db/schema";
import type { CustomFieldDef } from "@/types/customFields";
import { CollapsibleSection } from "../CollapsibleSection";
import { DetailsBlock } from "./DetailsBlock";
import { OrganizationSection } from "./OrganizationSection";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./SectionHeaderMenu";

// The deal sidebar's Organization node, extracted from DealSidebar so that oversized component
// stays under the file-size and cognitive-complexity budgets. It is the deal's most-branched
// section: a linked org (full OrganizationSection, with the org's own labels via showLabels), an
// org-less deal that still has deal-level custom fields (a bare card holding only DetailsBlock), or
// nothing. The deal's custom-field DetailsBlock is shared by both rendered branches.
export function DealOrganizationSection({
  hidden,
  org,
  orgMenuItems,
  bulkEditing,
  onStartBulk,
  onExitBulk,
  hiddenOrgFields,
  organizationCustomFieldDefs,
  currency,
  dealId,
  dealCustomFields,
  dealCustomFieldDefs,
  expectedUpdatedAt,
  title,
}: {
  hidden: boolean;
  org: Organization | null;
  orgMenuItems: SectionHeaderMenuItem[];
  bulkEditing: boolean;
  onStartBulk: () => void;
  onExitBulk: () => void;
  hiddenOrgFields: ReadonlySet<string>;
  organizationCustomFieldDefs: CustomFieldDef[];
  currency: string;
  dealId: string;
  dealCustomFields: Record<string, unknown>;
  dealCustomFieldDefs: CustomFieldDef[];
  expectedUpdatedAt: string;
  title: string;
}): React.ReactNode {
  if (hidden) return null;

  const detailsBlock =
    dealCustomFieldDefs.length > 0 ? (
      <DetailsBlock
        dealId={dealId}
        expectedUpdatedAt={expectedUpdatedAt}
        customFieldDefs={dealCustomFieldDefs}
        customFields={dealCustomFields}
        currency={currency}
      />
    ) : null;

  if (org !== null) {
    return (
      <OrganizationSection
        org={org}
        menuItems={orgMenuItems}
        bulkEditing={bulkEditing}
        onStartBulk={onStartBulk}
        onExitBulk={onExitBulk}
        hidden={hiddenOrgFields}
        customFieldDefs={organizationCustomFieldDefs}
        currency={currency}
        showLabels
      >
        {detailsBlock}
      </OrganizationSection>
    );
  }

  // Org-less deal that still carries deal-level custom fields: a bare card (no bulk-edit pencil,
  // matching sectionActions(..., { noEdit: true })) holding only the DetailsBlock.
  if (dealCustomFieldDefs.length > 0) {
    return (
      <CollapsibleSection
        title={title}
        headerActions={({ hideEmpty }) => (
          <SectionHeaderMenu
            sectionLabel={title}
            menuItems={orgMenuItems}
            fillGapsPressed={!hideEmpty}
          />
        )}
      >
        {detailsBlock}
      </CollapsibleSection>
    );
  }

  return null;
}
