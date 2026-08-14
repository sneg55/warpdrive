"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import type { Person } from "@/db/schema";
import type { PersonMatchCandidate } from "@/features/contacts/personOptionsRepo";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import type { CustomFieldDef } from "@/types/customFields";
import { CollapsibleSection } from "../CollapsibleSection";
import { PersonLinkEditor } from "./PersonLinkEditor";
import { PersonSection } from "./PersonSection";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./SectionHeaderMenu";
import { SidebarFieldRow } from "./SidebarFieldRow";

const NONE: ReadonlySet<string> = new Set();

// Mirror the rows PersonBlock renders for a linked person, honouring the same Settings > Data
// fields hides so the empty panel does not offer a row the populated one suppresses.
function emptyRows(hidden: ReadonlySet<string>): string[] {
  return ["Name", "First name", "Last name"]
    .concat(hidden.has("phones") ? [] : ["Phone"])
    .concat(hidden.has("emails") ? [] : ["Email"]);
}

// The deal sidebar's Person node. A linked person renders the shared PersonSection unchanged; a
// person-less deal still renders the panel (Pipedrive keeps it on screen either way) with empty
// rows, and the pencil opens an editor that links an existing contact or creates one.
//
// The panel used to be dropped entirely when the deal had no person, which both contradicted the
// Manage-sidebar-sections toggle the user had switched on and left no way to attach a person to an
// existing deal at all: personId was only ever settable from the Add deal modal.
export function DealPersonSection({
  person,
  dealId,
  expectedUpdatedAt,
  personOptions,
  menuItems,
  bulkEditing,
  onStartBulk,
  onExitBulk,
  hidden = NONE,
  customFieldDefs = [],
  currency = "USD",
}: {
  person: Person | null;
  dealId: string;
  expectedUpdatedAt: string;
  personOptions: PersonMatchCandidate[];
  menuItems: SectionHeaderMenuItem[];
  bulkEditing: boolean;
  onStartBulk: () => void;
  onExitBulk: () => void;
  hidden?: ReadonlySet<string>;
  customFieldDefs?: CustomFieldDef[];
  currency?: string;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();

  if (person !== null) {
    return (
      <PersonSection
        person={person}
        menuItems={menuItems}
        bulkEditing={bulkEditing}
        onStartBulk={onStartBulk}
        onExitBulk={onExitBulk}
        hidden={hidden}
        customFieldDefs={customFieldDefs}
        currency={currency}
        showLabels
      />
    );
  }

  return (
    <CollapsibleSection
      title="Person"
      headerActions={() => (
        <SectionHeaderMenu sectionLabel="Person" onEdit={onStartBulk} menuItems={menuItems} />
      )}
    >
      {bulkEditing ? (
        <PersonLinkEditor
          dealId={dealId}
          expectedUpdatedAt={expectedUpdatedAt}
          personOptions={personOptions}
          hidden={hidden}
          customFieldDefs={customFieldDefs}
          onDone={() => {
            onExitBulk();
            router.refresh();
          }}
          onError={reportError}
        />
      ) : (
        emptyRows(hidden).map((label) => (
          <SidebarFieldRow key={label} label={label} value="-" empty readOnly />
        ))
      )}
    </CollapsibleSection>
  );
}
