"use client";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type React from "react";
import { SortableColumnItem } from "./SortableColumnItem";

export interface ColumnMenuSortableListProps {
  order: readonly string[];
  onToggle: (key: string) => void;
  onReorder: (from: string, to: string) => void;
}

// The drag-reorderable half of ColumnMenu. Split out so dnd-kit is reachable only from here:
// ColumnMenu loads it through next/dynamic, keeping dnd-kit out of the /leads bundle, which
// otherwise paid for it just to render a cog button.
export function ColumnMenuSortableList({
  order,
  onToggle,
  onReorder,
}: ColumnMenuSortableListProps): React.ReactNode {
  const sensors = useSensors(useSensor(PointerSensor));

  function onDragEnd(e: DragEndEvent): void {
    const from = String(e.active.id);
    const to = e.over === null ? from : String(e.over.id);
    if (from !== to) onReorder(from, to);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={[...order]} strategy={verticalListSortingStrategy}>
        {order.map((key) => (
          <SortableColumnItem
            key={key}
            columnKey={key}
            pinned={key === "title"}
            onToggle={onToggle}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
