"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import { InlineTextField } from "@/features/inline-edit/InlineTextField";
import { err, ok, type Result } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";
import { updateOrgAction } from "./actions";

interface PanelOrg {
  id: string;
  name: string;
  address: Record<string, unknown> | null;
}

interface OrgSummaryEditPanelProps {
  org: PanelOrg;
  // Test seam / alternate refresh strategy. Defaults to router.refresh().
  onSaved?: () => void;
  // Hidden built-in field keys (settings > Data fields). Hiding "address" drops the address rows.
  hidden?: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

type AddressField = "street" | "city" | "region" | "country";

const ADDRESS_ROWS: readonly { field: AddressField; label: string }[] = [
  { field: "street", label: "Street" },
  { field: "city", label: "City" },
  { field: "region", label: "Region" },
  { field: "country", label: "Country" },
];

// Click-to-edit-in-place Summary rows (name + address) for the org detail aside, autosaving
// through updateOrgAction. Org has no CAS precondition (unlike deals): updateOrg is a plain
// record-scoped update, so no expectedUpdatedAt is threaded through.
//
// Firmographics (website/industry/revenue/employees) are Wave 3 (decision B3) and not built here.
export function OrgSummaryEditPanel({
  org,
  onSaved,
  hidden = NONE,
}: OrgSummaryEditPanelProps): React.ReactNode {
  const router = useRouter();
  const address = org.address ?? {};

  async function save(
    patch: { name: string } | { address: Record<string, unknown> },
  ): Promise<Result<unknown, string>> {
    const r = await updateOrgAction({ id: org.id, ...patch }, readCsrfToken());
    if (!r.ok) {
      // Do NOT refresh on failure: the write did not land, so the prop is not stale, and a
      // router.refresh() here re-renders the field and wipes the inline error the user needs
      // to see (CONTACTS-20 / INLINE-EDIT-13). Return the id so the field surfaces the error.
      return err(r.error.id);
    }
    // Resync only on success so the next edit reads the freshly persisted prop.
    if (onSaved !== undefined) onSaved();
    else router.refresh();
    return ok(r.value);
  }

  function saveAddressField(field: AddressField, v: string): Promise<Result<unknown, string>> {
    const trimmed = v.trim();
    return save({ address: { ...address, [field]: trimmed === "" ? undefined : trimmed } });
  }

  return (
    <>
      <FieldRow label="Name">
        <InlineTextField label="Name" value={org.name} onSave={(v) => save({ name: v.trim() })} />
      </FieldRow>
      {!hidden.has("address") &&
        ADDRESS_ROWS.map(({ field, label }) => (
          <FieldRow key={field} label={label} empty={typeof address[field] !== "string"}>
            <InlineTextField
              label={label}
              value={typeof address[field] === "string" ? address[field] : ""}
              onSave={(v) => saveAddressField(field, v)}
            />
          </FieldRow>
        ))}
    </>
  );
}
