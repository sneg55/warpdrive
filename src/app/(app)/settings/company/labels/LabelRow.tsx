"use client";
import type React from "react";
import { useState } from "react";
import { Select } from "@/components/ui/Select";
import { FIELD_INPUT } from "@/constants/formStyles";
import { LABEL_COLOR_CLASSES, LABEL_COLORS, type LabelColor } from "@/constants/labelColors";
import { STRINGS } from "@/constants/strings";

const S = STRINGS.settings;
const BTN = "text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40";
const LABEL_COLOR_OPTIONS = LABEL_COLORS.map((color) => ({ value: color, label: color }));

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
        <input
          aria-label={S.labelName}
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${FIELD_INPUT} flex-1`}
        />
      ) : (
        <span className="flex-1 text-sm">{row.name}</span>
      )}
      <div className="w-28 shrink-0">
        <Select
          ariaLabel={S.color}
          value={row.color}
          onChange={(value) => onColor(value as LabelColor)}
          options={LABEL_COLOR_OPTIONS}
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={BTN} disabled={isFirst} onClick={() => onMove("up")}>
          {S.moveUp}
        </button>
        <button type="button" className={BTN} disabled={isLast} onClick={() => onMove("down")}>
          {S.moveDown}
        </button>
        {editing ? (
          <button
            type="button"
            className={BTN}
            onClick={() => {
              if (name.trim() !== "") onRename(name.trim());
              setEditing(false);
            }}
          >
            {S.save}
          </button>
        ) : (
          <button type="button" className={BTN} onClick={() => setEditing(true)}>
            {S.rename}
          </button>
        )}
        <button type="button" className={BTN} onClick={onDelete}>
          {S.delete}
        </button>
      </div>
    </li>
  );
}
