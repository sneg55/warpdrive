"use client";

import Link from "next/link";
import type React from "react";

export const MAX_TITLE_LEN = 255;

interface DealTitleCellProps {
  dealId: string;
  title: string;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommit: (value: string) => void;
}

export function DealTitleCell(props: DealTitleCellProps): React.ReactNode {
  const { dealId, title, editing, onStartEdit, onCancelEdit, onCommit } = props;

  if (editing) {
    return (
      <input
        // biome-ignore lint/a11y/noAutofocus: focus follows the explicit edit click
        autoFocus
        aria-label="Edit title"
        maxLength={MAX_TITLE_LEN}
        defaultValue={title}
        className="w-full rounded border px-1 py-0.5 text-sm"
        onBlur={(e) => onCommit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") onCancelEdit();
        }}
      />
    );
  }

  return (
    <span className="group flex items-center gap-2">
      <Link href={`/deals/${dealId}`} className="text-primary hover:underline">
        {title}
      </Link>
      <button
        type="button"
        aria-label="Edit title"
        onClick={onStartEdit}
        className="text-xs text-muted-foreground opacity-0 transition-[color,opacity] duration-150 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
      >
        Edit
      </button>
    </span>
  );
}
