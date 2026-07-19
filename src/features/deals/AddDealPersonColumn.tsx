"use client";
import type React from "react";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { MAX_EMAIL_LEN, MAX_PHONE_LEN } from "@/features/contacts/fieldBounds";

export interface ContactPoint {
  label: string;
  value: string;
  primary?: boolean;
}

const PHONE_LABELS = ["Work", "Mobile", "Home", "Other"] as const;
const EMAIL_LABELS = ["Work", "Home", "Other"] as const;

interface AddDealPersonColumnProps {
  // Right column captures contact details for a NEW person only; disabled when an existing person
  // is selected (their details already live on the person record).
  disabled: boolean;
  phones: ContactPoint[];
  emails: ContactPoint[];
  onPhones: (next: ContactPoint[]) => void;
  onEmails: (next: ContactPoint[]) => void;
}

// The PERSON column of the Add deal dialog (Pipedrive): repeatable phone and email rows, each with
// a type label. Only meaningful when creating a new person inline.
export function AddDealPersonColumn({
  disabled,
  phones,
  emails,
  onPhones,
  onEmails,
}: AddDealPersonColumnProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Person
      </h3>

      <ContactRows
        kind="Phone"
        labels={PHONE_LABELS}
        rows={phones}
        disabled={disabled}
        onChange={onPhones}
      />
      <ContactRows
        kind="Email"
        labels={EMAIL_LABELS}
        rows={emails}
        disabled={disabled}
        onChange={onEmails}
      />
    </div>
  );
}

function ContactRows({
  kind,
  labels,
  rows,
  disabled,
  onChange,
}: {
  kind: "Phone" | "Email";
  labels: readonly string[];
  rows: ContactPoint[];
  disabled: boolean;
  onChange: (next: ContactPoint[]) => void;
}): React.ReactNode {
  function update(idx: number, patch: Partial<ContactPoint>): void {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  return (
    <div className="text-sm">
      <span className="mb-1 block font-medium">{kind}</span>
      <div className="flex flex-col gap-2">
        {rows.map((row, idx) => (
          // Positional rows for an ephemeral create form.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional contact rows
          <div key={idx} className="flex items-center gap-2">
            <Input
              aria-label={`${kind} ${idx + 1}`}
              type={kind === "Phone" ? "tel" : "email"}
              maxLength={kind === "Phone" ? MAX_PHONE_LEN : MAX_EMAIL_LEN}
              disabled={disabled}
              value={row.value}
              onChange={(e) => update(idx, { value: e.target.value })}
              placeholder={kind === "Phone" ? "+1 555 0100" : "name@company.com"}
              className="min-w-0 flex-1 disabled:bg-muted disabled:opacity-60"
            />
            {/* Select has no disabled prop (primitive is not modified for this sweep); a
                pointer-events-none wrapper reproduces the disabled input's read-only behavior. */}
            <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
              <Select
                ariaLabel={`${kind} ${idx + 1} type`}
                value={row.label}
                onChange={(v) => update(idx, { label: v })}
                options={labels.map<SelectOption>((l) => ({ value: l, label: l }))}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...rows, { label: labels[0] ?? "Work", value: "" }])}
        className="mt-2 text-sm font-medium text-primary hover:underline disabled:opacity-40"
      >
        + Add {kind.toLowerCase()}
      </button>
    </div>
  );
}
