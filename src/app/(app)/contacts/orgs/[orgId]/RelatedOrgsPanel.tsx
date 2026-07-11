"use client";
import type React from "react";
import { useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { ROW_ACTION_BUTTON } from "@/constants/formStyles";
import {
  addOrgRelationAction,
  removeOrgRelationAction,
} from "@/features/contacts/orgRelationActions";
import { readCsrfToken } from "@/utils/csrfCookie";

interface RelatedOrg {
  orgId: string;
  name: string;
  relationType: string;
}

interface OrgOption {
  id: string;
  name: string;
}

interface RelatedOrgsPanelProps {
  orgId: string;
  related: RelatedOrg[];
  orgOptions: OrgOption[];
  onChanged: () => void;
}

// "Related organizations" aside panel (Wave 3, Task 23): lists both directions of
// organization_relations for this org, plus an org Combobox + free-text relation-type input
// to add a new link. Mirrors OrgFirmographicsPanel's self-contained pending/error handling
// (no shared hook: this isn't a single-field inline edit, it's an add-to-list form).
export function RelatedOrgsPanel({
  orgId,
  related,
  orgOptions,
  onChanged,
}: RelatedOrgsPanelProps): React.ReactNode {
  const [targetOrgId, setTargetOrgId] = useState("");
  const [relationType, setRelationType] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relatedIds = new Set(related.map((r) => r.orgId));
  const pickerOptions: ComboboxOption[] = orgOptions
    .filter((o) => o.id !== orgId && !relatedIds.has(o.id))
    .map((o) => ({ value: o.id, label: o.name }));

  async function add(): Promise<void> {
    const trimmed = relationType.trim();
    if (targetOrgId === "" || trimmed === "" || pending) return;
    setPending(true);
    setError(null);
    const r = await addOrgRelationAction(
      { sourceOrgId: orgId, targetOrgId, relationType: trimmed },
      readCsrfToken(),
    );
    setPending(false);
    if (!r.ok) {
      setError("Couldn't add that relation. Try again.");
      return;
    }
    setTargetOrgId("");
    setRelationType("");
    onChanged();
  }

  async function remove(targetId: string): Promise<void> {
    setError(null);
    const r = await removeOrgRelationAction(
      { sourceOrgId: orgId, targetOrgId: targetId },
      readCsrfToken(),
    );
    if (!r.ok) {
      setError("Couldn't remove that relation. Try again.");
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-2">
      {related.length === 0 ? (
        <p className="text-sm text-gray-500">No related organizations yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {related.map((r) => (
            <li key={r.orgId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <a href={`/contacts/orgs/${r.orgId}`} className="text-blue-700 hover:underline">
                  {r.name}
                </a>
                <span className="ml-1.5 text-xs text-gray-500">{r.relationType}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${r.name}`}
                onClick={() => void remove(r.orgId)}
                className={ROW_ACTION_BUTTON}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5 pt-1">
        <div className="min-w-0 flex-1">
          <Combobox
            ariaLabel="Related organization"
            value={targetOrgId}
            onChange={setTargetOrgId}
            options={pickerOptions}
            placeholder="Choose org"
          />
        </div>
        <input
          aria-label="Relation type"
          value={relationType}
          onChange={(e) => setRelationType(e.target.value)}
          placeholder="e.g. partner"
          className="w-28 shrink-0 rounded-md border px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={targetOrgId === "" || relationType.trim() === "" || pending}
          onClick={() => void add()}
          className={`${ROW_ACTION_BUTTON} shrink-0`}
        >
          Add
        </button>
      </div>
      {error !== null && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
