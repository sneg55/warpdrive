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

export type LinkValue = Record<LinkKind, string | null>;

interface Props {
  targets: LinkTarget[];
  value: LinkValue;
  onChange: (kind: LinkKind, id: string | null) => void;
}

const KIND_WORD: Record<LinkKind, string> = {
  deal: "deal",
  person: "person",
  org: "organization",
};

const ADD_LINK_LABEL = "Add link";

const KIND_ICON: Record<LinkKind, React.ReactNode> = {
  deal: <CircleDollarSign aria-hidden="true" className="h-4 w-4" />,
  person: <User aria-hidden="true" className="h-4 w-4" />,
  org: <Building2 aria-hidden="true" className="h-4 w-4" />,
};

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
