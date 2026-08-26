"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type React from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import type { ColumnDef } from "./columnModel";

export interface SortableColumnRowProps {
  col: ColumnDef;
  // Pinned (the row-link column): checkbox disabled, no drag handle, always checked.
  pinned: boolean;
  onToggle: (key: string) => void;
}

// One visible column row inside the DnD list: a grip handle (non-pinned), a checkbox to hide it, and
// its header label. Reordering is driven by the parent's DndContext via useSortable's id. Generic
// version of the leads SortableColumnItem, taking the ColumnDef directly (no catalog coupling).
export function SortableColumnRow({
  col,
  pinned,
  onToggle,
}: SortableColumnRowProps): React.ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: col.key,
    disabled: pinned,
  });
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
          <GripVertical aria-hidden="true" className="h-4 w-4" />
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
