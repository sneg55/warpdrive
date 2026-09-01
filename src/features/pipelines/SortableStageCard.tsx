"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type React from "react";
import { StageEditCard } from "./StageEditCard";
import type { StageRow } from "./stageDiff";

interface SortableStageCardProps {
  sortId: string;
  row: StageRow;
  index: number;
  canDelete: boolean;
  onChange: (patch: Partial<StageRow>) => void;
  onDelete: () => void;
}

export function SortableStageCard({
  sortId,
  row,
  index,
  canDelete,
  onChange,
  onDelete,
}: SortableStageCardProps): React.ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "shrink-0 opacity-70" : "shrink-0"}>
      <StageEditCard
        row={row}
        index={index}
        canDelete={canDelete}
        onChange={onChange}
        onDelete={onDelete}
        dragHandle={
          <button
            type="button"
            aria-label={`Reorder stage ${index + 1}`}
            className="grid size-10 -m-2 cursor-grab touch-none place-items-center rounded text-muted-foreground transition-transform hover:bg-accent hover:text-foreground active:scale-[0.96]"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}
