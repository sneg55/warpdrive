"use client";
import type React from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { CustomFieldFormControl } from "@/features/custom-fields/render";
import type { CustomFieldDef } from "@/types/customFields";
import { MAX_EMAIL_LEN, MAX_PHONE_LEN } from "./fieldBounds";

const NO_ORGANIZATION_LABEL = "No organization";

export interface ContactPoint {
  label: string;
  value: string;
  primary?: boolean;
}

// Drop empty repeatable rows before they reach the (validated) create/update payload.
export function nonEmptyPoints(
  rows: ContactPoint[],
): Array<{ label: string; value: string; primary: boolean }> {
  return rows
    .filter((r) => r.value.trim() !== "")
    .map((r) => ({ label: r.label, value: r.value.trim(), primary: r.primary === true }));
}

// Collapse a blank address to null so we never persist an all-empty object.
export function cleanAddress(a: Record<string, string>): Record<string, string> | null {
  const entries = Object.entries(a).filter(([, v]) => v.trim() !== "");
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

const INPUT = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
const ADDRESS_FIELDS: Array<[string, string]> = [
  ["street", "Street"],
  ["city", "City"],
  ["region", "Region"],
  ["postal", "Postal"],
  ["country", "Country"],
];

export function TextField({
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
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-gray-700">
        {label}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </div>
  );
}

// Repeatable email/phone rows: edit value, remove a row, or append a blank. Empty rows are
// dropped by the caller before submit so they never reach the (validated) action payload.
export function ContactPointRows({
  kind,
  rows,
  onChange,
}: {
  kind: "Email" | "Phone";
  rows: ContactPoint[];
  onChange: (next: ContactPoint[]) => void;
}): React.ReactNode {
  const max = kind === "Email" ? MAX_EMAIL_LEN : MAX_PHONE_LEN;
  function update(idx: number, patch: Partial<ContactPoint>): void {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  return (
    <div className="space-y-1">
      <span className="block text-sm text-gray-700">{kind}</span>
      <div className="flex flex-col gap-2">
        {rows.map((row, idx) => (
          // Positional rows in an ephemeral edit form: index is a stable-enough key here.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional contact rows
          <div key={idx} className="flex items-center gap-2">
            <input
              aria-label={`${kind} ${idx + 1}`}
              type={kind === "Email" ? "email" : "tel"}
              maxLength={max}
              value={row.value}
              onChange={(e) => update(idx, { value: e.target.value })}
              className={INPUT}
            />
            <button
              type="button"
              aria-label={`Remove ${kind.toLowerCase()} ${idx + 1}`}
              onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange([...rows, { label: "Work", value: "", primary: rows.length === 0 }])
        }
        className="text-sm font-medium text-blue-700 hover:underline"
      >
        + Add {kind.toLowerCase()}
      </button>
    </div>
  );
}

const NONE: ReadonlySet<string> = new Set();

// Person base fields: email/phone rows plus the organization assignment select.
// `hidden` carries the person entity's hidden built-in keys (settings > Data fields).
export function PersonBaseFields({
  emails,
  phones,
  orgId,
  orgOptions,
  onEmails,
  onPhones,
  onOrgId,
  hidden = NONE,
}: {
  emails: ContactPoint[];
  phones: ContactPoint[];
  orgId: string;
  orgOptions: Array<{ id: string; name: string }>;
  onEmails: (next: ContactPoint[]) => void;
  onPhones: (next: ContactPoint[]) => void;
  onOrgId: (next: string) => void;
  hidden?: ReadonlySet<string>;
}): React.ReactNode {
  return (
    <>
      {!hidden.has("emails") && <ContactPointRows kind="Email" rows={emails} onChange={onEmails} />}
      {!hidden.has("phones") && <ContactPointRows kind="Phone" rows={phones} onChange={onPhones} />}
      {!hidden.has("org") && (
        <div className="space-y-1">
          <span className="block text-sm text-gray-700">Organization</span>
          <Select
            ariaLabel="Organization"
            value={orgId}
            onChange={onOrgId}
            placeholder={NO_ORGANIZATION_LABEL}
            options={[
              { value: "", label: NO_ORGANIZATION_LABEL },
              ...orgOptions.map<SelectOption>((o) => ({ value: o.id, label: o.name })),
            ]}
          />
        </div>
      )}
    </>
  );
}

export function AddressFields({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}): React.ReactNode {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm text-gray-700">Address</legend>
      {ADDRESS_FIELDS.map(([name, label]) => (
        <input
          key={name}
          aria-label={label}
          placeholder={label}
          value={value[name] ?? ""}
          onChange={(e) => onChange({ ...value, [name]: e.target.value })}
          className={INPUT}
        />
      ))}
    </fieldset>
  );
}

// Custom-field inputs reuse the shared CustomFieldFormControl (same renderer AddDealModal uses),
// so every field type edits identically to how it is created elsewhere.
export function CustomFieldRows({
  defs,
  values,
  onChange,
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, next: unknown) => void;
}): React.ReactNode {
  if (defs.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700">Custom fields</legend>
      {defs.map((def) => (
        <div key={def.id} className="space-y-1">
          <span className="block text-sm text-gray-600">{def.name}</span>
          <CustomFieldFormControl
            def={def}
            value={values[def.key]}
            onChange={(next) => onChange(def.key, next)}
          />
        </div>
      ))}
    </fieldset>
  );
}
