"use client";
import { Building2, CircleDollarSign, User, X } from "lucide-react";
import type React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";

export type LinkKind = "deal" | "person" | "org";

export interface LinkTarget {
  kind: LinkKind;
  id: string;
  label: string;
}

// Current linked id per kind; null means the user removed that link (or it was never set).
export type LinkValue = Record<LinkKind, string | null>;

interface Props {
  // The link targets this activity's context offers (deal/person/org). A kind is only ever
  // chipped or re-addable if it appears here.
  targets: LinkTarget[];
  value: LinkValue;
  onChange: (kind: LinkKind, id: string | null) => void;
}

// The human word used in the remove-chip aria label ("Remove organization link").
const KIND_WORD: Record<LinkKind, string> = {
  deal: "deal",
  person: "person",
  org: "organization",
};

const ADD_LINK_LABEL = "Add link";

// Entity-type glyph per link kind (Pipedrive parity: deal=$, person, org=building), shown as the
// leading icon on each linked-entity row.
const KIND_ICON: Record<LinkKind, React.ReactNode> = {
  deal: <CircleDollarSign aria-hidden="true" className="h-4 w-4" />,
  person: <User aria-hidden="true" className="h-4 w-4" />,
  org: <Building2 aria-hidden="true" className="h-4 w-4" />,
};

// Removable Deal/Person/Organization link rows + an "Add link" combobox that re-offers any removed
// link (Pipedrive parity, B3). PD stacks the linked entities as icon-prefixed rows at the bottom of
// the activity form, so this renders one bordered row per active link. Bound to the composer's link
// state; the submit payload reads the same state so removing a row clears that link on the activity.
export function LinkChips({ targets, value, onChange }: Props): React.ReactNode {
  const active = targets.filter((t) => value[t.kind] !== null);
  const removed = targets.filter((t) => value[t.kind] === null);

  if (targets.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {active.map((t) => (
        <div
          key={t.kind}
          className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
        >
          <span className="shrink-0 text-muted-foreground">{KIND_ICON[t.kind]}</span>
          <span className="min-w-0 flex-1 truncate">{t.label}</span>
          <button
            type="button"
            aria-label={`Remove ${KIND_WORD[t.kind]} link`}
            onClick={() => onChange(t.kind, null)}
            className="shrink-0 rounded text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {removed.length > 0 && (
        <div className="w-48">
          <Combobox
            ariaLabel={ADD_LINK_LABEL}
            placeholder={ADD_LINK_LABEL}
            value=""
            onChange={(kind) => {
              const target = removed.find((t) => t.kind === kind);
              if (target !== undefined) onChange(target.kind, target.id);
            }}
            options={removed.map<ComboboxOption>((t) => ({ value: t.kind, label: t.label }))}
          />
        </div>
      )}
    </div>
  );
}
