"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { STRINGS } from "@/constants/strings";
import type { Person } from "@/db/schema";
import type { PersonMatchCandidate } from "@/features/contacts/personOptionsRepo";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { updateDealAction } from "@/features/deals/updateAction";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";
import { CollapsibleSection } from "../CollapsibleSection";
import { PersonLinkEditor } from "./PersonLinkEditor";
import { PersonSection } from "./PersonSection";
import { PersonSwitchDialog } from "./PersonSwitchDialog";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./SectionHeaderMenu";
import { SidebarFieldRow } from "./SidebarFieldRow";

const NONE: ReadonlySet<string> = new Set();

// Mirror the rows PersonBlock renders for a linked person, honouring the same Settings > Data
// fields hides so the empty panel does not offer a row the populated one suppresses.
function emptyRows(hidden: ReadonlySet<string>): string[] {
  return ["Name"]
    .concat(hidden.has("firstName") ? [] : ["First name"])
    .concat(hidden.has("lastName") ? [] : ["Last name"])
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
  const utils = trpc.useUtils();
  const [switchOpen, setSwitchOpen] = useState(false);
  const menu = STRINGS.dealSidebar.menu;

  async function savePersonLink(personId: string | null): Promise<void> {
    const r = await updateDealAction({ dealId, expectedUpdatedAt, personId }, readCsrfToken());
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    setSwitchOpen(false);
    await refreshLinkedReads();
  }

  async function refreshLinkedReads(): Promise<void> {
    await Promise.all([
      utils.deal.participants.invalidate({ dealId }),
      utils.contacts.dealsForPerson.invalidate(),
      utils.contacts.personOptions.invalidate(),
    ]);
    router.refresh();
  }

  if (person !== null) {
    return (
      <>
        <PersonSection
          person={person}
          menuItems={[
            { label: menu.switchPerson, onSelect: () => setSwitchOpen(true) },
            {
              label: menu.unlinkPerson,
              onSelect: () => void savePersonLink(null),
              destructive: true,
            },
            ...menuItems,
          ]}
          bulkEditing={bulkEditing}
          onStartBulk={onStartBulk}
          onExitBulk={onExitBulk}
          hidden={hidden}
          customFieldDefs={customFieldDefs}
          currency={currency}
          showLabels
          onSaved={() => void refreshLinkedReads()}
        />
        {switchOpen && (
          <PersonSwitchDialog
            open
            currentPersonId={person.id}
            onOpenChange={setSwitchOpen}
            onSave={savePersonLink}
          />
        )}
      </>
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
            void refreshLinkedReads();
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
