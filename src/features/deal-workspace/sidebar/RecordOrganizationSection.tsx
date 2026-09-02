"use client";

import type React from "react";
import type { Organization } from "@/db/schema";
import type { CustomFieldDef } from "@/types/customFields";
import { CollapsibleSection } from "../CollapsibleSection";
import type { CustomFieldsSave } from "./customFieldsSave";
import { DetailsBlock } from "./DetailsBlock";
import { OrganizationSection } from "./OrganizationSection";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./SectionHeaderMenu";

export function RecordOrganizationSection({
  hidden,
  org,
  orgMenuItems,
  bulkEditing,
  onStartBulk,
  onExitBulk,
  hiddenOrgFields,
  organizationCustomFieldDefs,
  currency,
  customFields,
  customFieldDefs,
  onSaveCustomFields,
  detailsTitle,
  detailsMenuItems,
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
  customFields: Record<string, unknown>;
  customFieldDefs: CustomFieldDef[];
  onSaveCustomFields: CustomFieldsSave;
  detailsTitle: string;
  detailsMenuItems: SectionHeaderMenuItem[];
}): React.ReactNode {
  if (hidden) return null;

  const detailsBlock =
    customFieldDefs.length > 0 ? (
      <DetailsBlock
        onSave={onSaveCustomFields}
        customFieldDefs={customFieldDefs}
        customFields={customFields}
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

  if (customFieldDefs.length > 0) {
    return (
      <CollapsibleSection
        title={detailsTitle}
        headerActions={() => (
          <SectionHeaderMenu sectionLabel={detailsTitle} menuItems={detailsMenuItems} />
        )}
      >
        {detailsBlock}
      </CollapsibleSection>
    );
  }

  return null;
}
