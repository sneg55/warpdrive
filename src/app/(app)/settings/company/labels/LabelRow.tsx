"use client";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LABEL_COLOR_CLASSES, type LabelColor } from "@/constants/labelColors";
import { STRINGS } from "@/constants/strings";
import { ReorderControls } from "../ReorderControls";
import { LabelColorSelect } from "./LabelColorSelect";

const S = STRINGS.settings;
const ROW_BUTTON =
  "relative h-auto px-0 py-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground after:absolute after:left-0 after:top-1/2 after:h-10 after:w-full after:-translate-y-1/2 after:content-['']";

export interface LabelRowData {
  id: string;
  name: string;
  color: LabelColor;
}

interface Props {
  row: LabelRowData;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: "up" | "down") => void;
  onRename: (name: string) => void;
  onColor: (color: LabelColor) => void;
  onDelete: () => void;
}

// A single label row: color chip + enum color picker + inline rename + reorder + guarded delete.
export function LabelRow({
  row,
  isFirst,
  isLast,
  onMove,
  onRename,
  onColor,
  onDelete,
}: Props): React.ReactNode {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className={`rounded border px-2 py-0.5 text-xs ${LABEL_COLOR_CLASSES[row.color]}`}>
        {row.name}
      </span>
      {editing ? (
        <Input
          aria-label={S.labelName}
          name="labelName"
          autoComplete="off"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
        />
      ) : (
        <span className="flex-1 text-sm">{row.name}</span>
      )}
      <div className="w-32 shrink-0">
        <LabelColorSelect ariaLabel={S.color} value={row.color} onChange={onColor} />
      </div>
      <div className="flex items-center gap-3">
        <ReorderControls
          canMoveUp={!isFirst}
          canMoveDown={!isLast}
          onMoveUp={() => onMove("up")}
          onMoveDown={() => onMove("down")}
        />
        {editing ? (
          <Button
            variant="ghost"
            size="sm"
            className={ROW_BUTTON}
            onClick={() => {
              if (name.trim() !== "") onRename(name.trim());
              setEditing(false);
            }}
          >
            {S.save}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className={ROW_BUTTON} onClick={() => setEditing(true)}>
            {S.rename}
          </Button>
        )}
        <Button variant="ghost" size="sm" className={ROW_BUTTON} onClick={onDelete}>
          {S.delete}
        </Button>
      </div>
    </li>
  );
}
