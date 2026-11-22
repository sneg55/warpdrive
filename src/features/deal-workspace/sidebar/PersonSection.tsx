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

export function PersonSection({
  person,
  menuItems,
  bulkEditing,
  onStartBulk,
  onExitBulk,
  hidden = NONE,
  customFieldDefs = [],
  currency,
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
  currency: string;
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
