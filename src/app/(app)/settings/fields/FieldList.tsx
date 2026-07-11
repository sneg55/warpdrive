"use client";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import type React from "react";
import { STRINGS } from "@/constants/strings";
import { reorderDefsAction } from "@/features/custom-fields/actions";
import { reorderByDrag } from "@/features/custom-fields/reorderDrag";
import { readCsrfToken } from "@/utils/csrfCookie";
import { FieldRowItem } from "./FieldRowItem";
import type { FieldRow } from "./types";

export function FieldList({ rows }: { rows: FieldRow[] }): React.ReactNode {
  const router = useRouter();
  const ids = rows.map((r) => r.id);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const next = reorderByDrag(ids, String(active.id), String(over.id));
    const r = await reorderDefsAction({ orderedIds: next }, readCsrfToken());
    if (r.ok) router.refresh();
  }

  if (rows.length === 0) {
    return (
      <ul className="divide-y rounded-md border">
        <li className="px-3 py-2 text-sm text-muted-foreground">{STRINGS.settings.noFields}</li>
      </ul>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => void onDragEnd(e)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="divide-y rounded-md border">
          {rows.map((row) => (
            <FieldRowItem key={row.id} row={row} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
