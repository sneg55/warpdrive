"use client";

import type React from "react";
import { useId, useMemo, useRef, useState } from "react";
import { FIELD_INPUT } from "@/constants/formStyles";
import { createPersonAction } from "@/features/contacts/actions";
import type { PersonMatchCandidate } from "@/features/contacts/personOptionsRepo";
import {
  CustomFieldCreateFields,
  type CustomFieldValues,
  customFieldCreatePayload,
  firstMissingImportantField,
} from "@/features/custom-fields/CustomFieldCreateFields";
import { updateDealAction } from "@/features/deals/updateAction";
import type { CustomFieldDef } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";
import { findPersonMatches, type PersonMatchReason } from "./personMatch";

// Why a suggestion showed up, in the user's terms. An email or phone is effectively an identity, so
// say so plainly rather than the vaguer "similar contact" the create comboboxes use for names.
const REASON_TEXT: Record<PersonMatchReason, string> = {
  email: "already has this email",
  phone: "already has this phone",
  name: "has a similar name",
};

interface Draft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

const EMPTY: Draft = { firstName: "", lastName: "", phone: "", email: "" };

function fullName(d: Draft): string {
  return [d.firstName.trim(), d.lastName.trim()].filter((s) => s !== "").join(" ");
}

// The editor behind the pencil on a person-less deal. Every keystroke is checked against the
// visible people so an existing contact can be linked instead of duplicated; Save falls through to
// creating one only when the user did not take a suggestion.
export function PersonLinkEditor({
  dealId,
  expectedUpdatedAt,
  personOptions,
  hidden,
  customFieldDefs,
  onDone,
  onError,
}: {
  dealId: string;
  expectedUpdatedAt: string;
  personOptions: PersonMatchCandidate[];
  hidden: ReadonlySet<string>;
  customFieldDefs: CustomFieldDef[];
  onDone: () => void;
  onError: (errorId: string) => void;
}): React.ReactNode {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [values, setValues] = useState<CustomFieldValues>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A create that succeeded before its deal link failed must not create a second person when the
  // user hits Save again; reuse the one already committed.
  const createdId = useRef<string | null>(null);
  const ids = { first: useId(), last: useId(), phone: useId(), email: useId() };

  const matches = useMemo(
    () =>
      findPersonMatches(
        { name: fullName(draft), email: draft.email, phone: draft.phone },
        personOptions,
      ),
    [draft, personOptions],
  );

  function set(patch: Partial<Draft>): void {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function linkDeal(personId: string): Promise<boolean> {
    const r = await updateDealAction({ dealId, expectedUpdatedAt, personId }, readCsrfToken());
    if (r.ok) return true;
    onError(r.error.id);
    return false;
  }

  async function link(personId: string): Promise<void> {
    setPending(true);
    const ok = await linkDeal(personId);
    setPending(false);
    if (ok) onDone();
  }

  // Create-then-link. The deal link only happens once the person exists, so a failed create cannot
  // leave the deal pointing at nothing.
  async function save(): Promise<void> {
    const name = fullName(draft);
    if (name === "") return;
    // createPerson validates important/required person fields server-side, so catch it here and
    // name the field rather than surfacing a bare E_CF_003 (mirrors ConvertLeadDialog).
    const missing = firstMissingImportantField(customFieldDefs, values);
    if (missing !== null) {
      setError(`${missing.name} is required`);
      return;
    }
    setError(null);
    setPending(true);
    // Retry after a failed link: the person exists already, so go straight back to linking it.
    if (createdId.current !== null) {
      const relinked = await linkDeal(createdId.current);
      setPending(false);
      if (relinked) onDone();
      return;
    }
    const created = await createPersonAction(
      {
        name,
        firstName: draft.firstName.trim() === "" ? null : draft.firstName.trim(),
        lastName: draft.lastName.trim() === "" ? null : draft.lastName.trim(),
        emails:
          draft.email.trim() === ""
            ? []
            : [{ label: "work", value: draft.email.trim(), primary: true }],
        phones:
          draft.phone.trim() === ""
            ? []
            : [{ label: "work", value: draft.phone.trim(), primary: true }],
        orgId: null,
        customFields: customFieldCreatePayload(customFieldDefs, values),
      },
      readCsrfToken(),
    );
    if (!created.ok) {
      setPending(false);
      onError(created.error.id);
      return;
    }
    createdId.current = created.value.id;
    const ok = await linkDeal(created.value.id);
    setPending(false);
    if (ok) {
      createdId.current = null;
      onDone();
    }
  }

  return (
    <div className="space-y-2 py-1 text-sm">
      <Field
        id={ids.first}
        label="First name"
        value={draft.firstName}
        onChange={(v) => set({ firstName: v })}
      />
      <Field
        id={ids.last}
        label="Last name"
        value={draft.lastName}
        onChange={(v) => set({ lastName: v })}
      />
      {!hidden.has("phones") && (
        <Field
          id={ids.phone}
          label="Phone"
          value={draft.phone}
          onChange={(v) => set({ phone: v })}
        />
      )}
      {!hidden.has("emails") && (
        <Field
          id={ids.email}
          label="Email"
          value={draft.email}
          onChange={(v) => set({ email: v })}
        />
      )}

      <CustomFieldCreateFields
        defs={customFieldDefs}
        values={values}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        title="Person fields"
      />

      {matches.length > 0 && (
        <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2">
          {matches.map((m) => (
            <li key={m.option.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="font-medium">{m.option.name}</span> {REASON_TEXT[m.reason]}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => void link(m.option.id)}
                className="shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                Link
              </button>
            </li>
          ))}
        </ul>
      )}

      {error !== null && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={onDone}
          className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void save()}
          className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-24 shrink-0 text-right text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD_INPUT} flex-1`}
      />
    </div>
  );
}
