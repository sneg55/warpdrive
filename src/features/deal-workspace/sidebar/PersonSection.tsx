"use client";

import type React from "react";
import type { Person } from "@/db/schema";
import { ContactLabelsControl } from "@/features/contacts/ContactLabelsControl";
import { EnrichButton } from "@/features/enrichment/EnrichButton";
import type { CustomFieldDef } from "@/types/customFields";
import { CollapsibleSection } from "../CollapsibleSection";
import { PersonBlock } from "./PersonBlock";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./SectionHeaderMenu";

const NONE: ReadonlySet<string> = new Set();

// One shared Person section for deal, lead, and person-detail surfaces. Keeping the section shell,
// header bulk-edit action, field rows, and editors together prevents those surfaces from drifting
// into lookalike implementations with different behavior. showLabels opts a surface into the
// interactive person-labels row (deal + lead drawers, where the linked person has no header of its
// own); the contact-detail page leaves it off because its header already carries the label control.
export function PersonSection({
  person,
  menuItems,
  bulkEditing,
  onStartBulk,
  onExitBulk,
  hidden = NONE,
  customFieldDefs = [],
  currency = "USD",
  showLabels = false,
  onSaved,
}: {
  person: Person;
  menuItems: SectionHeaderMenuItem[];
  bulkEditing: boolean;
  onStartBulk: () => void;
  onExitBulk: () => void;
  hidden?: ReadonlySet<string>;
  customFieldDefs?: CustomFieldDef[];
  currency?: string;
  showLabels?: boolean;
  onSaved?: () => void;
}): React.ReactNode {
  return (
    <CollapsibleSection
      title="Person"
      headerActions={() => (
        <EnrichButton
          entityType="person"
          entityId={person.id}
          entityName={person.name}
          onApplied={onSaved}
        >
          {(fill) => (
            <SectionHeaderMenu
              sectionLabel="Person"
              onEdit={onStartBulk}
              menuItems={menuItems}
              {...fill}
            />
          )}
        </EnrichButton>
      )}
    >
      <PersonBlock
        person={person}
        bulkEditing={bulkEditing}
        onExitBulk={onExitBulk}
        hidden={hidden}
        customFieldDefs={customFieldDefs}
        currency={currency}
        onSaved={onSaved}
      />
      {showLabels && !bulkEditing ? (
        <ContactLabelsControl entityType="person" entityId={person.id} labels={person.labels} />
      ) : null}
    </CollapsibleSection>
  );
}
