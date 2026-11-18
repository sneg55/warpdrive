import type React from "react";

export interface ResolvedLabelChip {
  name: string;
  classes: string;
}

export function LabelChips({ labels }: { labels: ResolvedLabelChip[] }): React.ReactNode {
  if (labels.length === 0) return "-";
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {labels.map((label) => (
        <span
          key={label.name}
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${label.classes}`}
        >
          {label.name}
        </span>
      ))}
    </span>
  );
}
