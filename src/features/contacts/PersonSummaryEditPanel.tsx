"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import type { SelectOption } from "@/components/ui/Select";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import { InlineSelectField } from "@/features/inline-edit/InlineSelectField";
import { InlineTextField } from "@/features/inline-edit/InlineTextField";
import type { ContactPoint } from "@/types/contactPoint";
import { err, ok, type Result } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";
import { updatePersonAction } from "./actions";

const NO_ORGANIZATION_LABEL = "No organization";

interface PanelPerson {
  id: string;
  name: string;
  emails: ContactPoint[];
  phones: ContactPoint[];
  orgId: string | null;
}

interface PersonSummaryEditPanelProps {
  person: PanelPerson;
  orgOptions: Array<{ id: string; name: string }>;
  // Test seam / alternate refresh strategy. Defaults to router.refresh().
  onSaved?: () => void;
  // Hidden built-in field keys (settings > Data fields). Hidden rows are not rendered.
  hidden?: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

type PersonFieldChange = Partial<{
  name: string;
  emails: ContactPoint[];
  phones: ContactPoint[];
  orgId: string | null;
}>;

// Replaces (or inserts) the primary entry of an emails/phones array with `value`, leaving
// non-primary entries untouched. A blank value clears the primary entry entirely rather than
// storing an empty-string contact point.
export function setPrimaryPoint(points: ContactPoint[], value: string): ContactPoint[] {
  const rest = points.filter((p) => p.primary !== true);
  if (value.trim() === "") return rest;
  return [{ label: "work", value: value.trim(), primary: true }, ...rest];
}

// Exported so PersonBlock (deal-workspace sidebar) can reuse this instead of re-implementing
// the same primary-point lookup (Finding 2).
export function primaryValue(points: ContactPoint[]): string {
  return points.find((p) => p.primary === true)?.value ?? "";
}

// Click-to-edit-in-place Summary rows (name/primary email/primary phone/organization),
// autosaving through updatePersonAction. Unlike DealSummaryEditPanel, updatePerson has no CAS
// precondition (no expectedUpdatedAt column on persons), so every save is last-write-wins: a
// concurrent editor's change can be silently overwritten. Acceptable for Wave 2 scope; adding a
// CAS token to persons would be a separate schema change.
export function PersonSummaryEditPanel({
  person,
  orgOptions,
  onSaved,
  hidden = NONE,
}: PersonSummaryEditPanelProps): React.ReactNode {
  const router = useRouter();

  async function save(change: PersonFieldChange): Promise<Result<unknown, string>> {
    const r = await updatePersonAction({ id: person.id, ...change }, readCsrfToken());
    if (!r.ok) {
      // Do NOT resync on failure: the write did not land, so the prop is not stale, and a
      // router.refresh() here re-renders the field and wipes the inline error (and the user's typed
      // value) they need to see (CONTACTS-20 / INLINE-EDIT-13). Mirrors OrgSummaryEditPanel.
      return err(r.error.id);
    }
    // Resync only on success so the next edit reads the freshly persisted prop.
    if (onSaved !== undefined) onSaved();
    else router.refresh();
    return ok(r.value);
  }

  const orgSelectOptions: SelectOption[] = [
    { value: "", label: NO_ORGANIZATION_LABEL },
    ...orgOptions.map((o) => ({ value: o.id, label: o.name })),
  ];

  return (
    <>
      <FieldRow label="Name">
        <InlineTextField
          label="Name"
          value={person.name}
          onSave={(v) => save({ name: v.trim() })}
        />
      </FieldRow>
      {!hidden.has("emails") && (
        <FieldRow label="Primary email" empty={primaryValue(person.emails) === ""}>
          <InlineTextField
            label="Primary email"
            value={primaryValue(person.emails)}
            placeholder="+ Add email"
            onSave={(v) => save({ emails: setPrimaryPoint(person.emails, v) })}
          />
        </FieldRow>
      )}
      {!hidden.has("phones") && (
        <FieldRow label="Primary phone" empty={primaryValue(person.phones) === ""}>
          <InlineTextField
            label="Primary phone"
            value={primaryValue(person.phones)}
            placeholder="+ Add phone"
            onSave={(v) => save({ phones: setPrimaryPoint(person.phones, v) })}
          />
        </FieldRow>
      )}
      {!hidden.has("org") && (
        <FieldRow label="Organization" empty={person.orgId === null}>
          <InlineSelectField
            label="Organization"
            value={person.orgId ?? ""}
            options={orgSelectOptions}
            placeholder={NO_ORGANIZATION_LABEL}
            onSave={(v) => save({ orgId: v === "" ? null : v })}
          />
        </FieldRow>
      )}
    </>
  );
}
