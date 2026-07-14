"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { ERROR_IDS } from "@/constants/errorIds";
import { FIELD_INPUT } from "@/constants/formStyles";
import { STRINGS } from "@/constants/strings";
import { ACTIVITY_TYPE_ICON_KEYS, ActivityTypeIcon } from "@/features/activities/ActivityTypeIcon";
import {
  createActivityTypeAction,
  deleteActivityTypeAction,
  renameActivityTypeAction,
  reorderActivityTypesAction,
  setActivityTypeActiveAction,
} from "@/features/activities/typeActions";
import { moveInArray } from "@/features/settings/reorder";
import { useSyncedState } from "@/lib/useSyncedState";
import { readCsrfToken } from "@/utils/csrfCookie";

export interface ActivityTypeRow {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  isSystem: boolean;
  active: boolean;
}

function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const S = STRINGS.settings;
const BTN = "text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40";
const ACTIVITY_ICON_OPTIONS: SelectOption[] = ACTIVITY_TYPE_ICON_KEYS.map((key) => ({
  value: key,
  label: key,
  icon: <ActivityTypeIcon typeKey={key} />,
}));

// Activities tab (spec 6.2): list + rename + enable/disable + up/down reorder + guarded delete +
// add form with an icon picker. Reorder uses buttons (dnd deferred).
export function ActivityTypesClient({
  rows: initial,
}: {
  rows: ActivityTypeRow[];
}): React.ReactNode {
  const router = useRouter();
  // Re-seeds from refreshed server props (ACTIVITIES-17). See LostReasonsClient for why this is a
  // render-time sync rather than an effect.
  const [rows, setRows] = useSyncedState(initial);
  const [addName, setAddName] = useState("");
  const [addIcon, setAddIcon] = useState(ACTIVITY_TYPE_ICON_KEYS[0] ?? "task");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function add(): Promise<void> {
    const name = addName.trim();
    if (name === "") return;
    setPending(true);
    const r = await createActivityTypeAction(
      { key: slug(name), name, icon: addIcon },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      setAddName("");
      router.refresh();
    }
  }

  async function rename(id: string): Promise<void> {
    const name = editName.trim();
    if (name === "") return;
    await renameActivityTypeAction({ id, name }, readCsrfToken());
    setEditingId(null);
    router.refresh();
  }

  async function toggle(row: ActivityTypeRow): Promise<void> {
    await setActivityTypeActiveAction({ id: row.id, active: !row.active }, readCsrfToken());
    router.refresh();
  }

  async function del(id: string): Promise<void> {
    setRowError(null);
    const r = await deleteActivityTypeAction({ id }, readCsrfToken());
    if (r.ok) router.refresh();
    else if (r.error.id === ERROR_IDS.ACTIVITY_TYPE_IN_USE)
      setRowError({ id, msg: S.deleteTypeBlocked });
  }

  async function move(index: number, dir: "up" | "down"): Promise<void> {
    const next = moveInArray(rows, index, dir);
    if (next[index]?.id === rows[index]?.id) return;
    setRows(next);
    await reorderActivityTypesAction({ orderedIds: next.map((r) => r.id) }, readCsrfToken());
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <ul className="divide-y rounded-md border">
        {rows.map((row, i) => (
          <li key={row.id} className="flex items-center gap-3 px-3 py-2">
            <ActivityTypeIcon typeKey={row.icon ?? row.key} />
            {editingId === row.id ? (
              <input
                aria-label={S.activityTypeName}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={`${FIELD_INPUT} flex-1`}
              />
            ) : (
              <span
                className={`flex-1 text-sm ${row.active ? "" : "text-muted-foreground line-through"}`}
              >
                {row.name}
              </span>
            )}
            {row.isSystem && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {S.systemBadge}
              </span>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={BTN}
                disabled={i === 0}
                onClick={() => void move(i, "up")}
              >
                {S.moveUp}
              </button>
              <button
                type="button"
                className={BTN}
                disabled={i === rows.length - 1}
                onClick={() => void move(i, "down")}
              >
                {S.moveDown}
              </button>
              {editingId === row.id ? (
                <button type="button" className={BTN} onClick={() => void rename(row.id)}>
                  {S.save}
                </button>
              ) : (
                <button
                  type="button"
                  className={BTN}
                  onClick={() => {
                    setEditingId(row.id);
                    setEditName(row.name);
                  }}
                >
                  {S.rename}
                </button>
              )}
              <Switch
                checked={row.active}
                onCheckedChange={() => void toggle(row)}
                label={row.active ? S.disable : S.enable}
              />
              {!row.isSystem && (
                <button type="button" className={BTN} onClick={() => void del(row.id)}>
                  {S.delete}
                </button>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">{S.emptyList}</li>
        )}
      </ul>
      {rowError && <p className="text-sm text-red-600">{rowError.msg}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{S.activityTypeName}</span>
          <input
            aria-label={S.activityTypeName}
            required
            maxLength={120}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className={FIELD_INPUT}
          />
        </label>
        <div className="block">
          <span className="mb-1 block text-sm font-medium">{S.iconLabel}</span>
          <Select
            ariaLabel={S.iconLabel}
            value={addIcon}
            onChange={setAddIcon}
            options={ACTIVITY_ICON_OPTIONS}
          />
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="px-3"
          disabled={pending}
          onClick={() => void add()}
        >
          {S.addActivityType}
        </Button>
      </div>
    </div>
  );
}
