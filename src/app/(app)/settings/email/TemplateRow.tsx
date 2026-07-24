"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import type { SettingsTemplate } from "@/features/email/emailAuthoringReads";
import { formatCreatedOn } from "./formatDate";
import { EMAIL_SETTINGS_STRINGS as S } from "./strings";

const ROW_BUTTON =
  "relative h-auto px-0 py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground after:absolute after:left-0 after:top-1/2 after:h-10 after:w-full after:-translate-y-1/2 after:content-['']";

// A single OWN template row: drag handle (T4c), bulk-select checkbox (T4b), then the Name/Created/
// Owner columns (T4a) and Edit/Delete. Owner is always "You" here; shared rows (rendered inline by
// the client) are neither draggable nor selectable and show the author's name instead.
export function TemplateRow({
  template: t,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  template: SettingsTemplate;
  selected: boolean;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}): React.ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: t.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 px-3 py-2 text-sm">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${S.reorder} ${t.name}`}
        className="relative size-7 cursor-grab p-0 text-muted-foreground after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </Button>
      <Checkbox checked={selected} onCheckedChange={onToggle} label={`${S.select} ${t.name}`} />
      <span className="flex flex-1 items-center gap-2">
        {t.name}
        {t.isShared && (
          <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
            {S.sharedBadge}
          </span>
        )}
      </span>
      <span className="w-28 text-xs text-muted-foreground">{formatCreatedOn(t.createdAt)}</span>
      <span className="w-24 text-xs text-muted-foreground">{S.you}</span>
      <span className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className={ROW_BUTTON}
          onClick={onEdit}
          aria-label={`${S.edit} ${t.name}`}
        >
          {S.edit}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${ROW_BUTTON} text-destructive hover:text-destructive/80`}
          onClick={onDelete}
          aria-label={`${S.delete} ${t.name}`}
        >
          {S.delete}
        </Button>
      </span>
    </li>
  );
}
