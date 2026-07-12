"use client";
import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import type React from "react";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { resolveMailLabelChips } from "./mailLabelResolve";

// The label editor (cmdk + Popover) is only needed once the pencil is activated, so it is
// code-split out of the inbox-list path (ThreadRow renders these chips read-only per row).
const MailLabelPicker = dynamic(async () => (await import("./MailLabelPicker")).MailLabelPicker, {
  ssr: false,
});

// Local label: adding to src/constants/inboxStrings.ts is out of this unit's file scope, so the
// pencil affordance carries its accessible name here.
const EDIT_LABELS_LABEL = "Edit labels";

interface ThreadLabelChipsProps {
  labels: string[];
  // When provided, the chips gain a pencil affordance (B5) that reveals the label editor; the
  // editor stays hidden until the pencil is clicked. Omitted for read-only usage (the inbox row).
  onLabelsChange?: (keys: string[]) => void;
}

// Colored chips for a thread's applied mail labels (U6 catalog + U7 visual). Resolves each stored
// key against the user-managed mail-label catalog for its display name + color, so custom labels
// render (not just the three built-ins) and a legacy token still resolves via its seeded built-in.
// Keys with no catalog entry are skipped so a stray token never renders an unstyled chip. A15:
// chips render uppercase at 10px so they read as Pipedrive-style tags.
export function ThreadLabelChips({
  labels,
  onLabelsChange,
}: ThreadLabelChipsProps): React.ReactNode {
  const [editing, setEditing] = useState(false);
  const catalog = trpc.mailLabels.list.useQuery().data ?? [];
  const chips = resolveMailLabelChips(catalog, labels);
  const editable = onLabelsChange !== undefined;
  if (chips.length === 0 && !editable) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${chip.classes}`}
        >
          {chip.name}
        </span>
      ))}
      {editable && (
        <button
          type="button"
          aria-label={EDIT_LABELS_LABEL}
          onClick={() => setEditing((v) => !v)}
          className="inline-flex rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
      {editable && editing && (
        <MailLabelPicker value={labels} onChange={(next) => onLabelsChange(next)} />
      )}
    </span>
  );
}
