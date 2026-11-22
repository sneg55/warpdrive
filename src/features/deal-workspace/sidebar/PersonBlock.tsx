"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import type { Person } from "@/db/schema";
import { updatePersonAction } from "@/features/contacts/actions";
import { ContactCustomFieldRows } from "@/features/custom-fields/ContactCustomFieldRows";
import type { ContactPoint } from "@/types/contactPoint";
import type { CustomFieldDef } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ContactPointsValue, contactPointsEditor } from "./ContactPointsField";
import { committedPoints, orderedPoints, parsePoints, serializePoints } from "./contactPoints";
import { LabelChips, type ResolvedLabelChip } from "./LabelChips";
import { PersonBulkEditor } from "./PersonBulkEditor";
import { SidebarFieldRow } from "./SidebarFieldRow";
import { refreshQuietly, textEditor } from "./sidebarEditors";

type PersonFieldChange = Partial<{
  firstName: string | null;
  lastName: string | null;
  phones: ContactPoint[];
  emails: ContactPoint[];
}>;

const NONE: ReadonlySet<string> = new Set();

export function PersonBlock({
  person,
  bulkEditing = false,
  onExitBulk,
  hidden = NONE,
  hideNameParts = false,
  labels,
  customFieldDefs = [],
  currency,
  onSaved,
}: {
  person: Person;
  bulkEditing?: boolean;
  onExitBulk?: () => void;
  onSaved?: () => void;
  hidden?: ReadonlySet<string>;
  hideNameParts?: boolean;
  labels?: ResolvedLabelChip[];
  customFieldDefs?: CustomFieldDef[];
  currency: string;
}): React.ReactNode {
  const router = useRouter();

  async function save(change: PersonFieldChange): Promise<{ ok: boolean; errorId?: string }> {
    const r = await updatePersonAction({ id: person.id, ...change }, readCsrfToken());
    if (!r.ok) return { ok: false, errorId: r.error.id };
    refreshQuietly(router);
    onSaved?.();
    return { ok: true };
  }

  const phones = orderedPoints(person.phones);
  const emails = orderedPoints(person.emails, person.primaryEmail);

  if (bulkEditing) {
    return (
      <PersonBulkEditor
        firstName={person.firstName}
        lastName={person.lastName}
        phones={phones}
        emails={emails}
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
      {!hideNameParts && !hidden.has("firstName") && (
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
      {!hideNameParts && !hidden.has("lastName") && (
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
          value={phones.length === 0 ? "-" : <ContactPointsValue points={phones} kind="Phone" />}
          empty={phones.length === 0}
          initialDraft={serializePoints(phones)}
          renderEditor={contactPointsEditor("Phone")}
          onSave={(draft) => save({ phones: committedPoints(parsePoints(draft)) })}
        />
      )}
      {!hidden.has("emails") && (
        <SidebarFieldRow
          label="Email"
          value={emails.length === 0 ? "-" : <ContactPointsValue points={emails} kind="Email" />}
          empty={emails.length === 0}
          initialDraft={serializePoints(emails)}
          renderEditor={contactPointsEditor("Email")}
          onSave={(draft) => save({ emails: committedPoints(parsePoints(draft)) })}
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
