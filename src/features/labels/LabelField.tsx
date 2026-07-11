"use client";
import type React from "react";
import type { LabelTarget } from "@/constants/labelColors";
import { trpc } from "@/lib/trpc-client";
import { CatalogLabelPicker } from "./CatalogLabelPicker";
import { resolveLabelChips } from "./resolveLabels";

// Presentational label field: the applied labels as catalog-colored chips, followed by the
// catalog dropdown picker. Used wherever a form edits a record's labels without its own save
// wiring (add-deal / add-lead modals, lead sidebar). Surfaces with bespoke commit logic
// (ContactLabelsControl, the deal-sidebar LabelRow) compose the chips + picker themselves.
interface LabelFieldProps {
  target: LabelTarget;
  value: string[];
  onChange: (names: string[]) => void;
}

export function LabelField({ target, value, onChange }: LabelFieldProps): React.ReactNode {
  const catalog = trpc.labels.listByTarget.useQuery({ target }).data ?? [];
  const chips = resolveLabelChips(catalog, value);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.name}
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${chip.classes}`}
        >
          {chip.name}
        </span>
      ))}
      <CatalogLabelPicker target={target} value={value} onChange={onChange} />
    </div>
  );
}
