"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { STRINGS } from "@/constants/strings";
import {
  archiveDefAction,
  renameDefAction,
  setDefFlagsAction,
} from "@/features/custom-fields/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ReorderControls } from "../company/ReorderControls";
import { OptionEditor } from "./OptionEditor";
import type { FieldRow } from "./types";

const S = STRINGS.settings;
const OPTION_TYPES = new Set(["single_option", "multi_option"]);
const ROW_ACTION =
  "relative min-h-10 px-1 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out after:absolute after:inset-x-0 after:inset-y-0 after:content-[''] hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none";

export function FieldRowItem({
  row,
  isFirst,
  isLast,
  onMove,
}: {
  row: FieldRow;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: "up" | "down") => void;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.name);
  const [showOptions, setShowOptions] = useState(false);
  const isOptionType = OPTION_TYPES.has(row.type);

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
    <li className="px-3 py-2 transition-colors duration-150 ease-out hover:bg-accent/30 motion-reduce:transition-none">
      <div className="flex items-center gap-3">
        {editing ? (
          <Input
            aria-label={S.rename}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1"
          />
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{row.name}</span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground">
                {row.type.replaceAll("_", " ")}
              </span>
            </div>
            {activeOptions.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {activeOptions.map((o) => o.label).join(", ")}
              </p>
            )}
          </div>
        )}
        <ReorderControls
          canMoveUp={!isFirst}
          canMoveDown={!isLast}
          onMoveUp={() => onMove("up")}
          onMoveDown={() => onMove("down")}
        />
        {editing ? (
          <>
            <button type="button" onClick={() => void saveName()} className={ROW_ACTION}>
              {S.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(row.name);
                setEditing(false);
              }}
              className={ROW_ACTION}
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
            className={ROW_ACTION}
          >
            {S.rename}
          </button>
        )}
        {isOptionType && (
          <button type="button" onClick={() => setShowOptions((v) => !v)} className={ROW_ACTION}>
            {S.editOptions}
          </button>
        )}
        <button type="button" onClick={() => void archive()} className={ROW_ACTION}>
          {S.archive}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-2">
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
      </div>
      {isOptionType && showOptions && <OptionEditor defId={row.id} options={row.options} />}
    </li>
  );
}
