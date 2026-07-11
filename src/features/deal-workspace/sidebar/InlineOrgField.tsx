"use client";
import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { createOrgAction } from "@/features/contacts/actions";
import { updateDealAction } from "@/features/deals/updateAction";
import { EntityCombobox } from "@/features/entity-create/EntityCombobox";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { InlineFieldShell } from "@/features/inline-edit/InlineFieldShell";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import { readCsrfToken } from "@/utils/csrfCookie";

interface OrgRef {
  id: string;
  name: string;
}

// A pending organization choice made in the editor but not yet saved. PD's inline edit commits only
// via Save (no autosave), so the select-or-create combobox writes into this draft and Save persists
// it: pick an existing org, create a new one by name, clear the link, or leave it unchanged.
type Draft =
  | { kind: "unchanged" }
  | { kind: "existing"; id: string }
  | { kind: "new"; name: string }
  | { kind: "clear" };

// The deal Summary's Organization row, inline-editable like Value/Expected-close-date. The name is a
// record link (navigates); hovering reveals the pencil, which swaps in an EntityCombobox that
// searches existing organizations OR creates a new one, committed through the Cancel/Save footer.
export function InlineOrgField({
  dealId,
  expectedUpdatedAt,
  org,
  orgOptions,
  onSaved,
}: {
  dealId: string;
  expectedUpdatedAt: string;
  org: OrgRef | null;
  orgOptions: OrgRef[];
  onSaved: () => void;
}): React.ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ kind: "unchanged" });
  const [pending, setPending] = useState(false);
  const [errorId, setErrorId] = useState<string | null>(null);

  function start(): void {
    setDraft({ kind: "unchanged" });
    setErrorId(null);
    setEditing(true);
  }

  // Save is enabled only when the draft names a real change (PD dirty-gate): a different existing
  // org, a non-empty new name, or clearing an org that is currently set.
  const dirty =
    (draft.kind === "existing" && draft.id !== (org?.id ?? null)) ||
    (draft.kind === "new" && draft.name.trim() !== "") ||
    (draft.kind === "clear" && org !== null);

  // Turn the draft into the orgId to persist, creating the org first when the user typed a new name.
  // Returns { errorId } if the create fails so save() can surface the reason without persisting.
  async function resolveOrgId(): Promise<string | null | { errorId: string }> {
    if (draft.kind === "existing") return draft.id;
    if (draft.kind === "clear") return null;
    if (draft.kind === "new") {
      const r = await createOrgAction(
        { name: draft.name.trim(), address: null, customFields: {} },
        readCsrfToken(),
      );
      return r.ok ? r.value.id : { errorId: r.error.id };
    }
    return org?.id ?? null; // unchanged: unreachable while dirty-gated, kept total.
  }

  async function save(): Promise<void> {
    if (!dirty || pending) return;
    setPending(true);
    setErrorId(null);
    const resolved = await resolveOrgId();
    if (resolved !== null && typeof resolved === "object") {
      setErrorId(resolved.errorId);
      setPending(false);
      return;
    }
    const r = await updateDealAction(
      { dealId, expectedUpdatedAt, orgId: resolved },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      setEditing(false);
      onSaved();
    } else {
      setErrorId(r.error.id);
    }
  }

  return (
    <InlineFieldShell
      label="Organization"
      editing={editing}
      onStartEdit={start}
      value={
        org !== null ? (
          <Link
            href={`/contacts/orgs/${org.id}`}
            className="font-semibold text-primary hover:underline"
          >
            {org.name}
          </Link>
        ) : null
      }
      emptyPrompt="Add organization"
    >
      <div>
        <EntityCombobox
          label="Organization"
          hideLabel
          options={orgOptions}
          placeholder="Search or add an organization"
          createLabel={(q) => `Add '${q}' as new organization`}
          similarWarning="Similar organization already exists."
          onSelectExisting={(id) => setDraft({ kind: "existing", id })}
          onCreateNew={(name) => setDraft({ kind: "new", name })}
          onClear={() => setDraft({ kind: "clear" })}
        />
        {errorId !== null && (
          <p className="mt-1 text-xs text-destructive">{saveErrorMessage(errorId)}</p>
        )}
        <InlineEditFooter
          onCancel={() => setEditing(false)}
          onSave={() => void save()}
          saveDisabled={!dirty}
          pending={pending}
        />
      </div>
    </InlineFieldShell>
  );
}
