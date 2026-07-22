"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import type { Person } from "@/db/schema";
import { updatePersonAction } from "@/features/contacts/actions";
import { primaryValue, setPrimaryPoint } from "@/features/contacts/PersonSummaryEditPanel";
import { ContactCustomFieldRows } from "@/features/custom-fields/ContactCustomFieldRows";
import type { ContactPoint } from "@/types/contactPoint";
import type { CustomFieldDef } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";
import { LinkValue, mailtoHref, telHref } from "./contactLinks";
import { LabelChips, type ResolvedLabelChip } from "./LabelChips";
import { PersonBulkEditor } from "./PersonBulkEditor";
import { SidebarFieldRow } from "./SidebarFieldRow";
import { refreshQuietly, textEditor } from "./sidebarEditors";

// Fields the Person sidebar block can patch. All optional so each row only sends the one
// field it owns. Mirrors OrgBlock's field-to-column mapping.
type PersonFieldChange = Partial<{
  firstName: string | null;
  lastName: string | null;
  phones: ContactPoint[];
  emails: ContactPoint[];
}>;

// Editable identity fields for the deal-sidebar Person section. Saves through
// updatePersonAction (person has no CAS precondition, last-write-wins) and refreshes the
// router afterward so the next render carries the server-true values. Name stays a plain
// link, it is not one of the editable fields.
const NONE: ReadonlySet<string> = new Set();

export function PersonBlock({
  person,
  bulkEditing = false,
  onExitBulk,
  hidden = NONE,
  hideNameParts = false,
  labels,
  customFieldDefs = [],
  currency = "USD",
}: {
  person: Person;
  bulkEditing?: boolean;
  onExitBulk?: () => void;
  // Built-in field keys hidden in Settings > Data fields (see BUILTIN_FIELDS.person). A hidden
  // contact-point row is neither shown nor offered in bulk edit, mirroring the person detail page.
  hidden?: ReadonlySet<string>;
  // Lead-drawer parity: PD's lead PERSON section shows the display Name only. When set, the
  // First name / Last name rows are dropped (deal + contact surfaces keep them).
  hideNameParts?: boolean;
  // Resolved label chips (name + Tailwind classes) shown as a Labels row under Name. undefined on
  // surfaces that do not surface person labels (the deal sidebar); PD shows them on the lead drawer.
  labels?: ResolvedLabelChip[];
  customFieldDefs?: CustomFieldDef[];
  currency?: string;
}): React.ReactNode {
  const router = useRouter();

  async function save(change: PersonFieldChange): Promise<{ ok: boolean; errorId?: string }> {
    const r = await updatePersonAction({ id: person.id, ...change }, readCsrfToken());
    if (!r.ok) return { ok: false, errorId: r.error.id };
    // Refresh only after a committed write, and never let a refresh failure mask that success.
    refreshQuietly(router);
    return { ok: true };
  }

  // Normalize the stored contact-point shape (primary?: boolean) to the strict primary:
  // boolean that primaryValue/setPrimaryPoint (and updatePersonAction) expect. Mirrors the
  // same normalization PersonDetailClient does before handing persons to
  // PersonSummaryEditPanel.
  const phones = person.phones.map((p) => ({ ...p, primary: p.primary === true }));
  const emails = person.emails.map((e) => ({ ...e, primary: e.primary === true }));
  const phone = primaryValue(phones);

  if (bulkEditing) {
    return (
      <PersonBulkEditor
        firstName={person.firstName}
        lastName={person.lastName}
        phones={phones}
        emails={emails}
        primaryEmail={person.primaryEmail}
        save={save}
        onExit={onExitBulk ?? (() => {})}
        hidden={hidden}
      />
    );
  }

  return (
    <>
      <SidebarFieldRow
        label="Name"
        value={
          <a href={`/contacts/people/${person.id}`} className="text-primary hover:underline">
            {person.name}
          </a>
        }
        readOnly
      />
      {labels !== undefined && (
        <SidebarFieldRow label="Labels" value={<LabelChips labels={labels} />} readOnly />
      )}
      {!hideNameParts && (
        <SidebarFieldRow
          label="First name"
          value={person.firstName ?? "-"}
          empty={person.firstName === null}
          initialDraft={person.firstName ?? ""}
          renderEditor={textEditor("editor-firstName")}
          onSave={(draft) => {
            const trimmed = draft.trim();
            return save({ firstName: trimmed === "" ? null : trimmed });
          }}
        />
      )}
      {!hideNameParts && (
        <SidebarFieldRow
          label="Last name"
          value={person.lastName ?? "-"}
          empty={person.lastName === null}
          initialDraft={person.lastName ?? ""}
          renderEditor={textEditor("editor-lastName")}
          onSave={(draft) => {
            const trimmed = draft.trim();
            return save({ lastName: trimmed === "" ? null : trimmed });
          }}
        />
      )}
      {!hidden.has("phones") && (
        <SidebarFieldRow
          label="Phone"
          value={phone === "" ? "-" : <LinkValue href={telHref(phone)}>{phone}</LinkValue>}
          empty={phone === ""}
          initialDraft={phone}
          renderEditor={textEditor("editor-phone")}
          onSave={(draft) => save({ phones: setPrimaryPoint(phones, draft) })}
        />
      )}
      {!hidden.has("emails") && (
        <SidebarFieldRow
          label="Email"
          value={
            person.primaryEmail === null ? (
              "-"
            ) : (
              <LinkValue href={mailtoHref(person.primaryEmail)}>{person.primaryEmail}</LinkValue>
            )
          }
          empty={person.primaryEmail === null}
          initialDraft={person.primaryEmail ?? ""}
          renderEditor={textEditor("editor-email")}
          onSave={(draft) => save({ emails: setPrimaryPoint(emails, draft) })}
        />
      )}
      <ContactCustomFieldRows
        contact={{
          kind: "person",
          id: person.id,
          customFields: person.customFields as Record<string, unknown>,
        }}
        defs={customFieldDefs}
        currency={currency}
      />
    </>
  );
}
