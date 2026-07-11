"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { updateOrgAction } from "@/features/contacts/actions";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { InlineFieldShell } from "@/features/inline-edit/InlineFieldShell";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import type { InlineSaveResult } from "@/features/inline-edit/useInlineEditField";
import { useInlineEditField } from "@/features/inline-edit/useInlineEditField";
import { err, ok } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";
import { FieldRow } from "./FieldRow";
import { refreshQuietly } from "./sidebarEditors";

// The editable text parts of a structured address, in display order.
const ADDRESS_PARTS = [
  { key: "street", label: "Street" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "postal", label: "Postal code" },
  { key: "country", label: "Country" },
] as const;

type AddressPart = (typeof ADDRESS_PARTS)[number]["key"];
type AddressDraft = Record<AddressPart, string>;

function toDraft(address: Record<string, unknown> | null): AddressDraft {
  const d = {} as AddressDraft;
  for (const { key } of ADDRESS_PARTS) {
    d[key] = typeof address?.[key] === "string" ? address[key] : "";
  }
  return d;
}

// Merge the draft parts back into an address object: keep only non-empty parts, and preserve any
// non-text keys (lat/lng) the geocoder may have set so editing the text does not drop coordinates.
function draftToAddress(
  draft: AddressDraft,
  original: Record<string, unknown> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { key } of ADDRESS_PARTS) {
    const v = draft[key].trim();
    if (v !== "") out[key] = v;
  }
  if (typeof original?.lat === "number") out.lat = original.lat;
  if (typeof original?.lng === "number") out.lng = original.lng;
  return out;
}

// Deal-sidebar Organization address: a single "Address" row that opens a composite editor (the
// five text parts, one Save) rather than a per-part row explosion. Saves through updateOrgAction
// (org has no CAS precondition) and refreshes only after a committed write.
export function OrgAddressField({
  orgId,
  address,
  formatted,
}: {
  orgId: string;
  address: Record<string, unknown> | null;
  formatted: string;
}): React.ReactNode {
  const router = useRouter();
  const initial = toDraft(address);
  const f = useInlineEditField<AddressDraft>(initial);
  const dirty = ADDRESS_PARTS.some(({ key }) => f.draft[key] !== initial[key]);

  async function onSave(draft: AddressDraft): Promise<InlineSaveResult> {
    const r = await updateOrgAction(
      { id: orgId, address: draftToAddress(draft, address) },
      readCsrfToken(),
    );
    if (!r.ok) return err(r.error.id);
    // Refresh only after a committed write; never let a refresh failure mask the success.
    refreshQuietly(router);
    return ok(r.value);
  }

  const editor = f.editing ? (
    <div className="flex flex-col gap-1.5">
      {ADDRESS_PARTS.map(({ key, label }) => (
        <input
          key={key}
          aria-label={label}
          placeholder={label}
          value={f.draft[key]}
          disabled={f.pending}
          onChange={(e) => f.setDraft({ ...f.draft, [key]: e.target.value })}
          className="h-8 w-full rounded border border-field-border bg-card px-2 text-sm"
        />
      ))}
      {f.error !== null ? (
        <span role="alert" className="text-destructive text-xs">
          {saveErrorMessage(f.error)}
        </span>
      ) : null}
      <InlineEditFooter
        onCancel={f.cancel}
        onSave={() => f.commit(onSave)}
        saveDisabled={!dirty}
        pending={f.pending}
      />
    </div>
  ) : null;

  return (
    <FieldRow label="Address" empty={formatted === "-"}>
      <InlineFieldShell
        label="Address"
        editing={f.editing}
        onStartEdit={f.start}
        value={formatted === "-" ? null : formatted}
        emptyPrompt="+ Add address"
      >
        {editor}
      </InlineFieldShell>
    </FieldRow>
  );
}
