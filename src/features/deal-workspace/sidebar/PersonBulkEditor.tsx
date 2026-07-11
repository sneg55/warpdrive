"use client";
import type React from "react";
import { useState } from "react";
import { primaryValue, setPrimaryPoint } from "@/features/contacts/PersonSummaryEditPanel";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import type { ContactPoint } from "@/types/contactPoint";
import { BulkEditRow as BulkRow } from "./BulkEditRow";

// The change shape PersonBlock.save accepts (kept in sync with it). All optional so the bulk save
// sends only the fields the user actually changed.
export interface PersonBulkChange {
  firstName?: string | null;
  lastName?: string | null;
  phones?: ContactPoint[];
  emails?: ContactPoint[];
}

interface PersonBulkEditorProps {
  firstName: string | null;
  lastName: string | null;
  phones: ContactPoint[];
  emails: ContactPoint[];
  primaryEmail: string | null;
  save: (change: PersonBulkChange) => Promise<{ ok: boolean; errorId?: string }>;
  onExit: () => void;
  // Built-in field keys hidden in Settings > Data fields; a hidden contact point is not offered here.
  hidden?: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

const textOrNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

// Section bulk editor for the Person block: every field open at once behind a single Save. Mounted
// only while the section is in bulk mode, so its draft state initializes fresh from the record each
// time. Save sends one updatePersonAction carrying only the changed fields.
export function PersonBulkEditor({
  firstName,
  lastName,
  phones,
  emails,
  primaryEmail,
  save,
  onExit,
  hidden = NONE,
}: PersonBulkEditorProps): React.ReactNode {
  const initialPhone = primaryValue(phones);
  const [first, setFirst] = useState(firstName ?? "");
  const [last, setLast] = useState(lastName ?? "");
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(primaryEmail ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSave(): void {
    const change: PersonBulkChange = {};
    if (textOrNull(first) !== firstName) change.firstName = textOrNull(first);
    if (textOrNull(last) !== lastName) change.lastName = textOrNull(last);
    if (phone !== initialPhone) change.phones = setPrimaryPoint(phones, phone);
    if (email !== (primaryEmail ?? "")) change.emails = setPrimaryPoint(emails, email);

    if (Object.keys(change).length === 0) {
      onExit();
      return;
    }
    setPending(true);
    setError(null);
    save(change)
      .then((r) => {
        setPending(false);
        if (r.ok) onExit();
        else setError(saveErrorMessage(r.errorId));
      })
      .catch(() => {
        setPending(false);
        setError(saveErrorMessage());
      });
  }

  return (
    <div className="flex flex-col gap-2">
      <BulkRow label="First name" value={first} onChange={setFirst} disabled={pending} />
      <BulkRow label="Last name" value={last} onChange={setLast} disabled={pending} />
      {!hidden.has("phones") && (
        <BulkRow label="Phone" value={phone} onChange={setPhone} disabled={pending} />
      )}
      {!hidden.has("emails") && (
        <BulkRow label="Email" value={email} onChange={setEmail} disabled={pending} />
      )}
      {error !== null ? (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      ) : null}
      <InlineEditFooter onCancel={onExit} onSave={onSave} saveDisabled={false} pending={pending} />
    </div>
  );
}
