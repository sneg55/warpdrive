"use client";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type React from "react";
import type { ColumnDef } from "./columnModel";
import { SortableColumnRow } from "./SortableColumnRow";

export interface ColumnsMenuSortableListProps {
  catalog: readonly ColumnDef[];
  order: readonly string[];
  pinned: string | undefined;
  onToggle: (key: string) => void;
  onReorder: (from: string, to: string) => void;
}

// The drag-reorderable half of ColumnsMenu. Split out so dnd-kit is reachable only from here:
// ColumnsMenu loads it through next/dynamic, keeping dnd-kit out of the People, Orgs and Deals
// list bundles, which otherwise paid for it just to render a cog button.
export function ColumnsMenuSortableList({
  catalog,
  order,
  pinned,
  onToggle,
  onReorder,
}: ColumnsMenuSortableListProps): React.ReactNode {
  const sensors = useSensors(useSensor(PointerSensor));
  const byKey = new Map(catalog.map((c) => [c.key, c]));

  function onDragEnd(e: DragEndEvent): void {
    const from = String(e.active.id);
    const to = e.over === null ? from : String(e.over.id);
    if (from !== to) onReorder(from, to);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={[...order]} strategy={verticalListSortingStrategy}>
        {order.map((key) => {
          const col = byKey.get(key);
          return col === undefined ? null : (
            <SortableColumnRow key={key} col={col} pinned={key === pinned} onToggle={onToggle} />
          );
        })}
      </SortableContext>
    </DndContext>
  );
}
