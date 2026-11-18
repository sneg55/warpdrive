"use client";
import type React from "react";
import { useState } from "react";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import type { ContactPoint } from "@/types/contactPoint";
import { BulkEditRow as BulkRow } from "./BulkEditRow";
import { type ContactPointKind, ContactPointsEditor } from "./ContactPointsField";
import { committedPoints, parsePoints, serializePoints } from "./contactPoints";

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
  save: (change: PersonBulkChange) => Promise<{ ok: boolean; errorId?: string }>;
  onExit: () => void;
  hidden?: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

const textOrNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

export function PersonBulkEditor({
  firstName,
  lastName,
  phones,
  emails,
  save,
  onExit,
  hidden = NONE,
}: PersonBulkEditorProps): React.ReactNode {
  const initialPhones = serializePoints(phones);
  const initialEmails = serializePoints(emails);
  const [first, setFirst] = useState(firstName ?? "");
  const [last, setLast] = useState(lastName ?? "");
  const [phoneDraft, setPhoneDraft] = useState(initialPhones);
  const [emailDraft, setEmailDraft] = useState(initialEmails);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSave(): void {
    const change: PersonBulkChange = {};
    if (textOrNull(first) !== firstName) change.firstName = textOrNull(first);
    if (textOrNull(last) !== lastName) change.lastName = textOrNull(last);
    if (phoneDraft !== initialPhones) change.phones = committedPoints(parsePoints(phoneDraft));
    if (emailDraft !== initialEmails) change.emails = committedPoints(parsePoints(emailDraft));

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
        <BulkPointsRow
          kind="Phone"
          draft={phoneDraft}
          setDraft={setPhoneDraft}
          disabled={pending}
        />
      )}
      {!hidden.has("emails") && (
        <BulkPointsRow
          kind="Email"
          draft={emailDraft}
          setDraft={setEmailDraft}
          disabled={pending}
        />
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

function BulkPointsRow({
  kind,
  draft,
  setDraft,
  disabled,
}: {
  kind: ContactPointKind;
  draft: string;
  setDraft: (v: string) => void;
  disabled: boolean;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
      <span>{kind}</span>
      <ContactPointsEditor kind={kind} draft={draft} setDraft={setDraft} disabled={disabled} />
    </div>
  );
}
