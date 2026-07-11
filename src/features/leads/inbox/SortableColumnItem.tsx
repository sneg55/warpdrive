"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type React from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { LEAD_COLUMNS } from "./columns";

export interface SortableColumnItemProps {
  columnKey: string;
  // Pinned (Title): checkbox disabled, no drag handle. Always checked (it is a visible column).
  pinned: boolean;
  onToggle: (key: string) => void;
}

// One visible column row inside the DnD list: a grip handle (non-pinned), a checkbox to hide it,
// and its header label. Reordering is driven by the parent's DndContext via useSortable's id.
export function SortableColumnItem({
  columnKey,
  pinned,
  onToggle,
}: SortableColumnItemProps): React.ReactNode {
  const col = LEAD_COLUMNS.find((c) => c.key === columnKey);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: columnKey,
    disabled: pinned,
  });
  if (col === undefined) return null;
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
    >
      {pinned ? (
        <span className="w-4" aria-hidden="true" />
      ) : (
        <button
          type="button"
          aria-label={`Reorder ${col.header}`}
          className="cursor-grab text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M8 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
          </svg>
        </button>
      )}
      <div className="flex flex-1 items-center gap-2">
        <Checkbox
          checked
          disabled={pinned}
          onCheckedChange={() => onToggle(col.key)}
          label={col.header}
        />
        <span>{col.header}</span>
      </div>
    </div>
  );
}
