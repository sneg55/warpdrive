"use client";
import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import type React from "react";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { resolveMailLabelChips } from "./mailLabelResolve";

const MailLabelPicker = dynamic(async () => (await import("./MailLabelPicker")).MailLabelPicker, {
  ssr: false,
});

const EDIT_LABELS_LABEL = "Edit labels";

interface ThreadLabelChipsProps {
  labels: string[];
  onLabelsChange?: (keys: string[]) => void;
}

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
