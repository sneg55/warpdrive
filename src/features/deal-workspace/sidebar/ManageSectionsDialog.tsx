"use client";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DealSidebarSectionId,
  DealSidebarSectionPreference,
} from "@/constants/dealSidebarSections";
import { sectionName } from "@/constants/dealSidebarSections";
import { STRINGS } from "@/constants/strings";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { setSidebarSectionsAction } from "@/features/identity/preferencesActions";
import { readCsrfToken } from "@/utils/csrfCookie";

export interface ManageSectionsDialogProps {
  open: boolean;
  sections: DealSidebarSectionPreference[];
  onOpenChange: (open: boolean) => void;
  onSaved: (sections: DealSidebarSectionPreference[]) => void;
}

function SectionRow({
  section,
  index,
  count,
  onMove,
  onToggle,
}: {
  section: DealSidebarSectionPreference;
  index: number;
  count: number;
  onMove: (id: DealSidebarSectionId, dir: -1 | 1) => void;
  onToggle: (id: DealSidebarSectionId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section.id,
  });
  const name = sectionName(section.id);
  // Summary is non-hideable (it hosts the manage-sections trigger); lock its visibility toggle.
  const locked = section.id === "summary";
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
    >
      <button
        type="button"
        aria-label={`Reorder ${name}`}
        className="cursor-grab text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="h-4 w-4" />
      </button>
      <Checkbox
        checked={section.visible}
        disabled={locked}
        onCheckedChange={() => onToggle(section.id)}
        label={locked ? `${name} (always shown)` : `Show ${name}`}
      />
      <span className="min-w-0 flex-1 text-sm">{name}</span>
      <button
        type="button"
        aria-label={`Move ${name} up`}
        disabled={index === 0}
        onClick={() => onMove(section.id, -1)}
        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        Up
      </button>
      <button
        type="button"
        aria-label={`Move ${name} down`}
        disabled={index === count - 1}
        onClick={() => onMove(section.id, 1)}
        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        Down
      </button>
    </div>
  );
}

export function ManageSectionsDialog({
  open,
  sections,
  onOpenChange,
  onSaved,
}: ManageSectionsDialogProps): React.ReactNode {
  const [draft, setDraft] = useState(sections);
  const reportError = useDealActionError();
  const sensors = useSensors(useSensor(PointerSensor));

  // Re-seed the draft when the dialog opens, and when the saved sections change beneath it.
  // Adjusting during render avoids the stale-then-correct double render an effect would cause.
  const [seen, setSeen] = useState({ open, sections });
  if (seen.open !== open || seen.sections !== sections) {
    setSeen({ open, sections });
    if (open) setDraft(sections);
  }

  function onDragEnd(event: DragEndEvent): void {
    const from = draft.findIndex((section) => section.id === event.active.id);
    const to = draft.findIndex((section) => section.id === event.over?.id);
    if (from !== -1 && to !== -1 && from !== to)
      setDraft((current) => arrayMove(current, from, to));
  }

  function move(id: DealSidebarSectionId, dir: -1 | 1): void {
    setDraft((current) => {
      const from = current.findIndex((section) => section.id === id);
      const to = from + dir;
      return from === -1 || to < 0 || to >= current.length ? current : arrayMove(current, from, to);
    });
  }

  function toggle(id: DealSidebarSectionId): void {
    if (id === "summary") return; // non-hideable: it hosts the manage-sections trigger
    setDraft((current) =>
      current.map((section) =>
        section.id === id ? { ...section, visible: !section.visible } : section,
      ),
    );
  }

  async function save(): Promise<void> {
    const result = await setSidebarSectionsAction({ sections: draft }, readCsrfToken());
    if (result.ok) {
      onSaved(draft);
      onOpenChange(false);
    } else {
      reportError(result.error.id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{STRINGS.dealSidebar.menu.manageSections}</DialogTitle>
        </DialogHeader>
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext
            items={draft.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
          >
            {draft.map((section, index) => (
              <SectionRow
                key={section.id}
                section={section}
                index={index}
                count={draft.length}
                onMove={move}
                onToggle={toggle}
              />
            ))}
          </SortableContext>
        </DndContext>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {STRINGS.dealSidebar.orgDialog.cancel}
          </Button>
          <Button onClick={() => void save()}>{STRINGS.dealSidebar.orgDialog.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
