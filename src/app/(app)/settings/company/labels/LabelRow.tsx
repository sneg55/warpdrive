"use client";
import type React from "react";
import { useState } from "react";
import { FIELD_INPUT } from "@/constants/formStyles";
import { LABEL_COLOR_CLASSES, type LabelColor } from "@/constants/labelColors";
import { STRINGS } from "@/constants/strings";
import { ReorderControls } from "../ReorderControls";
import { LabelColorSelect } from "./LabelColorSelect";

const S = STRINGS.settings;
const BTN = "text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40";

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
