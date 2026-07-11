"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Switch } from "@/components/ui/Switch";
import { STRINGS } from "@/constants/strings";
import {
  archiveDefAction,
  renameDefAction,
  setDefFlagsAction,
} from "@/features/custom-fields/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { OptionEditor } from "./OptionEditor";
import type { FieldRow } from "./types";

const S = STRINGS.settings;
const OPTION_TYPES = new Set(["single_option", "multi_option"]);

export function FieldRowItem({ row }: { row: FieldRow }): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.name);
  const [showOptions, setShowOptions] = useState(false);
  const isOptionType = OPTION_TYPES.has(row.type);

  const style = { transform: CSS.Transform.toString(transform), transition };
  const activeOptions = row.options.filter((o) => o.archived !== true);

  async function saveName(): Promise<void> {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === row.name) {
      setEditing(false);
      return;
    }
    const r = await renameDefAction({ id: row.id, name: trimmed }, readCsrfToken());
    if (r.ok) {
      setEditing(false);
      router.refresh();
    } else reportError(r.error.id);
  }

  async function archive(): Promise<void> {
    const r = await archiveDefAction({ id: row.id }, readCsrfToken());
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  // Always sends the full { isImportant, showInAddForm } pair so toggling one flag can never
  // clobber the other with a stale default.
  async function setFlags(next: { isImportant: boolean; showInAddForm: boolean }): Promise<void> {
    const r = await setDefFlagsAction({ id: row.id, ...next }, readCsrfToken());
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  return (
    <li ref={setNodeRef} style={style} className="px-3 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={S.dragHandle}
          className="cursor-grab text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          ::
        </button>
        {editing ? (
          <input
            aria-label={S.rename}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 rounded border px-2 py-1 text-sm"
          />
        ) : (
          <span className="flex-1 text-sm font-medium">{row.name}</span>
        )}
        <span className="text-xs text-muted-foreground">{row.type}</span>
        {activeOptions.length > 0 && (
          <span className="max-w-[30%] truncate text-xs text-muted-foreground">
            {activeOptions.map((o) => o.label).join(", ")}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Switch
            checked={row.isImportant}
            onCheckedChange={(v) =>
              void setFlags({ isImportant: v, showInAddForm: row.showInAddForm })
            }
            label={S.important}
          />
          <span className="text-xs text-muted-foreground">{S.important}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Switch
            checked={row.showInAddForm}
            onCheckedChange={(v) =>
              void setFlags({ isImportant: row.isImportant, showInAddForm: v })
            }
            label={S.showInAddForm}
          />
          <span className="text-xs text-muted-foreground">{S.showInAddForm}</span>
        </span>
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => void saveName()}
              className="text-xs font-medium hover:text-foreground"
            >
              {S.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(row.name);
                setEditing(false);
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {S.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(row.name);
              setEditing(true);
            }}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {S.rename}
          </button>
        )}
        {isOptionType && (
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {S.editOptions}
          </button>
        )}
        <button
          type="button"
          onClick={() => void archive()}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {S.archive}
        </button>
      </div>
      {isOptionType && showOptions && <OptionEditor defId={row.id} options={row.options} />}
    </li>
  );
}
