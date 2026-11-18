"use client";
import type React from "react";
import type { LabelTarget } from "@/constants/labelColors";
import { trpc } from "@/lib/trpc-client";
import { CatalogLabelPicker } from "./CatalogLabelPicker";
import { resolveLabelChips } from "./resolveLabels";

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
