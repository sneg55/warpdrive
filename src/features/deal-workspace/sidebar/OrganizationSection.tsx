"use client";

import type React from "react";
import type { Organization } from "@/db/schema";
import { ContactLabelsControl } from "@/features/contacts/ContactLabelsControl";
import type { CustomFieldDef } from "@/types/customFields";
import { CollapsibleSection } from "../CollapsibleSection";
import { OrgBlock } from "./OrgBlock";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./SectionHeaderMenu";

const NONE: ReadonlySet<string> = new Set();

// Shared Organization section for deal, lead, and organization-detail surfaces. Children let the
// deal workspace append its own custom fields to this same card without introducing another box.
// showLabels opts a surface into the interactive org-labels row (deal + lead drawers, where the
// linked org has no header of its own); organization-detail leaves it off (its header owns labels).
export function OrganizationSection({
  org,
  menuItems,
  bulkEditing,
  onStartBulk,
  onExitBulk,
  hidden = NONE,
  customFieldDefs = [],
  currency = "USD",
  showLabels = false,
  children,
}: {
  org: Organization;
  menuItems: SectionHeaderMenuItem[];
  bulkEditing: boolean;
  onStartBulk: () => void;
  onExitBulk: () => void;
  hidden?: ReadonlySet<string>;
  customFieldDefs?: CustomFieldDef[];
  currency?: string;
  showLabels?: boolean;
  children?: React.ReactNode;
}): React.ReactNode {
  return (
    <CollapsibleSection
      title="Organization"
      headerActions={({ hideEmpty, showEmptyFields }) => (
        <SectionHeaderMenu
          sectionLabel="Organization"
          onEdit={onStartBulk}
          menuItems={menuItems}
          fillGapsPressed={!hideEmpty}
          onToggleFillGaps={showEmptyFields}
        />
      )}
    >
      <OrgBlock
        org={org}
        bulkEditing={bulkEditing}
        onExitBulk={onExitBulk}
        hidden={hidden}
        customFieldDefs={customFieldDefs}
        currency={currency}
      />
      {showLabels && !bulkEditing ? (
        <ContactLabelsControl entityType="organization" entityId={org.id} labels={org.labels} />
      ) : null}
      {children}
    </CollapsibleSection>
  );
}
